use crate::settings::{download_dir, read_settings};
use crate::state::{AppState, DownloadState};
use crate::systems::systems;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufReader, Cursor, Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const MAX_DOWNLOAD_BYTES: u64 = 1024 * 1024 * 1024;
const UA: &str = "Lovemu/1.0";

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

fn unique_tmp(ext: &str) -> std::path::PathBuf {
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("lovemu_{}_{}.{}", std::process::id(), seq, ext))
}

fn host_of(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
}

fn allowed_hosts() -> HashSet<String> {
    let mut set: HashSet<String> = [
        "github.com",
        "api.github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
        "github-releases.githubusercontent.com",
        "raw.githubusercontent.com",
        "codeload.github.com",
        "avatars.githubusercontent.com",
        "user-images.githubusercontent.com",
        "gist.github.com",
        "gist.githubusercontent.com",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();

    if let Some(obj) = systems().as_object() {
        for sys in obj.values() {
            let emus = sys.get("emulators").and_then(|e| e.as_array());
            for emu in emus.into_iter().flatten() {
                if let Some(url) = emu
                    .get("source")
                    .and_then(|s| s.get("url"))
                    .and_then(|u| u.as_str())
                {
                    if let Some(h) = host_of(url) {
                        set.insert(h);
                    }
                }
            }
        }
    }
    set
}

fn url_allowed(allowed: &HashSet<String>, url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(u) => u.scheme() == "https" && u.host_str().map(|h| allowed.contains(h)).unwrap_or(false),
        Err(_) => false,
    }
}

fn emit_status(app: &AppHandle, key: &Option<String>, status: &str, extra: Value) {
    let mut payload = json!({ "key": key, "status": status });
    if let (Some(obj), Some(p)) = (extra.as_object(), payload.as_object_mut()) {
        for (k, v) in obj {
            p.insert(k.clone(), v.clone());
        }
    }
    let _ = app.emit("download-status", payload);
}

fn emit_log(app: &AppHandle, key: &Option<String>, msg: impl Into<String>) {
    let _ = app.emit("download-log", json!({ "key": key, "message": msg.into() }));
}

fn build_client(allowed: HashSet<String>) -> reqwest::Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() > 10 {
                return attempt.error("too many redirects");
            }
            let ok = attempt
                .url()
                .host_str()
                .map(|h| allowed.contains(h))
                .unwrap_or(false);
            if ok {
                attempt.follow()
            } else {
                attempt.error("blocked redirect host")
            }
        }))
        .build()
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    archive.extract(dest).map_err(|e| e.to_string())
}

fn extract_7z(archive: &Path, dest: &Path) -> Result<(), String> {
    sevenz_rust::decompress_file(archive, dest).map_err(|e| e.to_string())
}

fn extract_tar_xz(archive: &Path, dest: &Path) -> Result<(), String> {
    let f = File::open(archive).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(f);
    let mut decompressed: Vec<u8> = Vec::new();
    lzma_rs::xz_decompress(&mut reader, &mut decompressed).map_err(|e| format!("xz: {e:?}"))?;
    let mut tar = tar::Archive::new(Cursor::new(decompressed));
    tar.unpack(dest).map_err(|e| e.to_string())
}

fn download_to(
    app: &AppHandle,
    client: &reqwest::blocking::Client,
    download: &DownloadState,
    key: &Option<String>,
    url: &str,
    tmp_path: &Path,
) -> Result<(), String> {
    let mut attempt_err = String::new();
    for attempt in 1..=3 {
        if download.cancel.load(Ordering::Relaxed) {
            return Err("Cancelled".into());
        }
        match try_download(app, client, download, key, url, tmp_path) {
            Ok(()) => return Ok(()),
            Err(e) => {
                if download.cancel.load(Ordering::Relaxed) {
                    return Err("Cancelled".into());
                }
                emit_log(app, key, format!("Download failed ({attempt}/3): {e}"));
                attempt_err = e;
                std::thread::sleep(Duration::from_millis(1000 * attempt));
            }
        }
    }
    Err(attempt_err)
}

fn try_download(
    app: &AppHandle,
    client: &reqwest::blocking::Client,
    download: &DownloadState,
    key: &Option<String>,
    url: &str,
    tmp_path: &Path,
) -> Result<(), String> {
    let mut resp = client
        .get(url)
        .header(reqwest::header::USER_AGENT, UA)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    if total > 0 && total > MAX_DOWNLOAD_BYTES {
        return Err("File too large".into());
    }
    let mut file = File::create(tmp_path).map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    let mut last_emit = Instant::now();
    let mut last_pct: i64 = -1;
    loop {
        if download.cancel.load(Ordering::Relaxed) {
            return Err("Cancelled".into());
        }
        let n = resp.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        received += n as u64;
        if received > MAX_DOWNLOAD_BYTES {
            return Err("File too large".into());
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        if total > 0 {
            let pct = ((received as f64 / total as f64) * 100.0).floor() as i64;
            if pct != last_pct && (pct == 100 || last_emit.elapsed().as_millis() >= 200) {
                last_pct = pct;
                last_emit = Instant::now();
                emit_status(app, key, "progress", json!({ "received": received, "total": total, "percent": pct }));
            }
        } else if last_emit.elapsed().as_millis() >= 500 {
            last_emit = Instant::now();
            emit_status(app, key, "progress", json!({ "received": received, "total": 0 }));
        }
    }
    if total > 0 {
        emit_status(app, key, "progress", json!({ "received": total, "total": total, "percent": 100 }));
    }
    Ok(())
}

fn fetch_latest_asset(
    client: &reqwest::blocking::Client,
    app: &AppHandle,
    key: &Option<String>,
    owner: &str,
    repo: &str,
    archive: &str,
    match_pat: &str,
) -> Result<String, String> {
    let api = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");
    emit_log(app, key, format!("HTTP GET {api}"));
    let mut last = String::from("request failed");
    for attempt in 1..=3 {
        let res = client
            .get(&api)
            .header(reqwest::header::USER_AGENT, UA)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.json::<Value>());
        match res {
            Ok(json) => {
                let assets = json.get("assets").and_then(|a| a.as_array()).cloned().unwrap_or_default();
                let ext = format!(".{}", archive.trim_start_matches('.'));
                let pat = match_pat.to_lowercase();
                let pick = assets
                    .iter()
                    .find(|a| {
                        let name = a.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase();
                        name.ends_with(&ext) && (pat.is_empty() || name.contains(&pat))
                    })
                    .or_else(|| {
                        assets.iter().find(|a| {
                            a.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase().ends_with(&ext)
                        })
                    });
                match pick.and_then(|a| a.get("browser_download_url")).and_then(|u| u.as_str()) {
                    Some(url) => {
                        let name = pick.and_then(|a| a.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                        emit_log(app, key, format!("Selected asset: {name} -> {url}"));
                        return Ok(url.to_string());
                    }
                    None => return Err("No matching asset found in latest GitHub release".into()),
                }
            }
            Err(e) => {
                last = e.to_string();
                emit_log(app, key, format!("HTTP GET failed ({attempt}/3): {last}"));
                std::thread::sleep(Duration::from_millis(500 * attempt));
            }
        }
    }
    Err(last)
}

fn stem_for(asset_base: &str, is_tar_xz: bool, is_zip: bool, is_7z: bool) -> String {
    let lower = asset_base.to_lowercase();
    if is_tar_xz && lower.ends_with(".tar.xz") {
        asset_base[..asset_base.len() - 7].to_string()
    } else if is_zip && lower.ends_with(".zip") {
        asset_base[..asset_base.len() - 4].to_string()
    } else if is_7z && lower.ends_with(".7z") {
        asset_base[..asset_base.len() - 3].to_string()
    } else if let Some(idx) = asset_base.rfind('.') {
        asset_base[..idx].to_string()
    } else {
        asset_base.to_string()
    }
}

fn move_staging_to_final(staging: &Path, final_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(final_dir).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(staging).map_err(|e| e.to_string())?.flatten() {
        let from = entry.path();
        let to = final_dir.join(entry.file_name());
        let _ = std::fs::remove_dir_all(&to);
        let _ = std::fs::remove_file(&to);
        if std::fs::rename(&from, &to).is_err() {
            if from.is_dir() {
                copy_dir(&from, &to)?;
                let _ = std::fs::remove_dir_all(&from);
            } else {
                std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(&from);
            }
        }
    }
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

struct DownloadGuard(Arc<DownloadState>);
impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut t) = self.0.tmp.lock() {
            if let Some(p) = t.take() {
                let _ = std::fs::remove_file(&p);
            }
        }
        if let Ok(mut s) = self.0.staging.lock() {
            if let Some(p) = s.take() {
                let _ = std::fs::remove_dir_all(&p);
            }
        }
        self.0.downloading.store(false, Ordering::Relaxed);
        self.0.cancel.store(false, Ordering::Relaxed);
    }
}

fn run_download(
    app: AppHandle,
    download: Arc<DownloadState>,
    system: &str,
    emulator_id: Option<String>,
) -> Value {
    if download
        .downloading
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return json!({ "ok": false, "error": "A download is already in progress" });
    }
    download.cancel.store(false, Ordering::Relaxed);
    let _guard = DownloadGuard(download.clone());

    let key: Option<String> = emulator_id.clone();
    emit_status(&app, &key, "start", json!({}));

    let result = (|| -> Result<Value, String> {
        let allowed = allowed_hosts();
        let client = build_client(allowed.clone()).map_err(|e| e.to_string())?;

        let cfg = systems();
        let sys = cfg.get(system).ok_or_else(|| format!("{system} config not found"))?;
        let emus = sys
            .get("emulators")
            .and_then(|e| e.as_array())
            .ok_or_else(|| format!("{system} has no emulators"))?;

        let entry = match &emulator_id {
            Some(id) => emus
                .iter()
                .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(id.as_str())),
            None => emus.iter().find(|e| e.get("source").is_some()),
        }
        .ok_or_else(|| "Emulator not found".to_string())?;

        let source = entry
            .get("source")
            .ok_or_else(|| "This emulator has no download source".to_string())?;

        let (asset_url, archive) = if let Some(gh) = source.get("github") {
            let owner = gh.get("owner").and_then(|v| v.as_str()).unwrap_or("");
            let repo = gh.get("repo").and_then(|v| v.as_str()).unwrap_or("");
            let match_pat = gh.get("match").and_then(|v| v.as_str()).unwrap_or("");
            let archive = gh.get("archive").and_then(|v| v.as_str()).unwrap_or("zip").to_lowercase();
            if owner.is_empty() || repo.is_empty() {
                return Err("Invalid GitHub source".into());
            }
            let api = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");
            if !url_allowed(&allowed, &api) {
                return Err("Blocked host".into());
            }
            let url = fetch_latest_asset(&client, &app, &key, owner, repo, &archive, match_pat)?;
            (url, archive)
        } else if let Some(url) = source.get("url").and_then(|v| v.as_str()) {
            let archive = source.get("archive").and_then(|v| v.as_str()).unwrap_or("zip").to_lowercase();
            emit_log(&app, &key, format!("Using direct URL: {url}"));
            (url.to_string(), archive)
        } else {
            return Err("Neither GitHub nor direct URL configured".into());
        };

        if !url_allowed(&allowed, &asset_url) {
            return Err("Blocked host".into());
        }

        let downloaded_dir = download_dir(&read_settings());
        std::fs::create_dir_all(&downloaded_dir).map_err(|e| e.to_string())?;
        let staging = downloaded_dir.join(format!(
            ".staging_{}",
            key.as_deref().unwrap_or(system).replace(' ', "_")
        ));
        let _ = std::fs::remove_dir_all(&staging);
        std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        if let Ok(mut s) = download.staging.lock() {
            *s = Some(staging.clone());
        }

        let url_path = reqwest::Url::parse(&asset_url)
            .ok()
            .map(|u| u.path().to_string())
            .unwrap_or_default();
        let asset_base = url_path.rsplit('/').next().unwrap_or("download").to_string();
        let lower_url = asset_url.to_lowercase();
        let is_tar_xz = archive.ends_with("tar.xz") || lower_url.ends_with(".tar.xz");
        let is_zip = archive == "zip" || lower_url.ends_with(".zip");
        let is_7z = archive == "7z" || lower_url.ends_with(".7z");

        let raw_stem = stem_for(&asset_base, is_tar_xz, is_zip, is_7z);
        let stem = Path::new(&raw_stem)
            .file_name()
            .and_then(|x| x.to_str())
            .filter(|s| !s.is_empty() && *s != "." && *s != "..")
            .unwrap_or("download")
            .to_string();
        let final_dir = if is_zip || is_7z {
            downloaded_dir.join(&stem)
        } else {
            downloaded_dir.clone()
        };

        let tmp_ext = if is_tar_xz {
            "tar.xz"
        } else if is_zip {
            "zip"
        } else {
            "bin"
        };
        let tmp_path = unique_tmp(tmp_ext);
        if let Ok(mut t) = download.tmp.lock() {
            *t = Some(tmp_path.clone());
        }

        emit_status(&app, &key, "downloading", json!({ "url": asset_url }));
        emit_log(&app, &key, format!("Downloading to: {}", tmp_path.display()));
        download_to(&app, &client, &download, &key, &asset_url, &tmp_path)?;

        if is_zip {
            emit_status(&app, &key, "extracting", json!({ "type": "zip" }));
            extract_zip(&tmp_path, &staging)?;
        } else if is_tar_xz {
            emit_status(&app, &key, "extracting", json!({ "type": "tar.xz" }));
            extract_tar_xz(&tmp_path, &staging)?;
        } else if is_7z {
            emit_status(&app, &key, "extracting", json!({ "type": "7z" }));
            extract_7z(&tmp_path, &staging)?;
        } else {
            std::fs::copy(&tmp_path, staging.join(&asset_base)).map_err(|e| e.to_string())?;
        }

        let _ = std::fs::remove_file(&tmp_path);
        move_staging_to_final(&staging, &final_dir)?;
        let _ = std::fs::remove_dir_all(&staging);
        if let Ok(mut t) = download.tmp.lock() {
            *t = None;
        }
        if let Ok(mut s) = download.staging.lock() {
            *s = None;
        }

        emit_status(&app, &key, "done", json!({ "destDir": final_dir.to_string_lossy() }));
        Ok(json!({
            "ok": true,
            "destDir": final_dir.to_string_lossy(),
            "source": asset_url,
            "key": key,
        }))
    })();

    match result {
        Ok(v) => v,
        Err(e) => {
            emit_status(&app, &key, "error", json!({ "message": e.clone() }));
            emit_log(&app, &key, format!("Error: {e}"));
            json!({ "ok": false, "error": e })
        }
    }
}

#[tauri::command]
pub async fn download_system(
    app: AppHandle,
    state: State<'_, AppState>,
    system: String,
    key: Option<String>,
) -> Result<Value, ()> {
    if system.is_empty() {
        return Ok(json!({ "ok": false, "error": "systemName is required" }));
    }
    let download = state.download.clone();
    let res = tauri::async_runtime::spawn_blocking(move || run_download(app, download, &system, key))
        .await
        .unwrap_or_else(|_| json!({ "ok": false, "error": "join error" }));
    Ok(res)
}

#[tauri::command]
pub fn cancel_download(app: AppHandle, state: State<AppState>) -> Value {
    if !state.download.downloading.load(Ordering::Relaxed) {
        return json!({ "ok": false, "error": "No active download" });
    }
    state.download.cancel.store(true, Ordering::Relaxed);
    emit_status(&app, &None, "error", json!({ "message": "Cancelled" }));
    emit_log(&app, &None, "Download cancelled by user");
    json!({ "ok": true })
}

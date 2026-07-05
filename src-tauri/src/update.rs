use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;

const REPO: &str = "Riyoway/HomePad";
const RELEASES_URL: &str = "https://github.com/Riyoway/HomePad/releases";

/// Parse a `vMAJOR.MINOR.PATCH`-style tag into a comparable tuple.
fn parse_ver(s: &str) -> (u64, u64, u64) {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let mut it = s.split(|c: char| !c.is_ascii_digit());
    let a = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let b = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let c = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    (a, b, c)
}

/// Check the GitHub "latest release" and compare it to the running version.
/// Async + spawn_blocking so the blocking HTTP call never runs on the UI thread
/// (a slow/firewalled network would otherwise freeze the whole app for ~20s).
#[tauri::command]
pub async fn check_update() -> Value {
    tauri::async_runtime::spawn_blocking(check_update_blocking)
        .await
        .unwrap_or_else(|_| {
            json!({ "ok": false, "error": "join error", "current": env!("CARGO_PKG_VERSION") })
        })
}

fn check_update_blocking() -> Value {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let api = format!("https://api.github.com/repos/{REPO}/releases/latest");

    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(20))
        .user_agent(format!("HomePad/{current}"))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "error": e.to_string(), "current": current }),
    };

    let resp = match client
        .get(&api)
        .header("Accept", "application/vnd.github+json")
        .send()
    {
        Ok(r) => r,
        Err(e) => return json!({ "ok": false, "error": e.to_string(), "current": current }),
    };

    // No published releases yet -> nothing to update to.
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return json!({
            "ok": true, "current": current, "latest": "",
            "hasUpdate": false, "noReleases": true, "url": RELEASES_URL
        });
    }
    if !resp.status().is_success() {
        return json!({ "ok": false, "error": format!("GitHub returned {}", resp.status()), "current": current });
    }

    let body: Value = match resp.json() {
        Ok(v) => v,
        Err(e) => return json!({ "ok": false, "error": e.to_string(), "current": current }),
    };

    let tag = body.get("tag_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let notes = body.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let url = body
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or(RELEASES_URL)
        .to_string();
    let prerelease = body.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false);
    let installer_url = pick_installer(&body);
    let channel = if is_installed() { "installer" } else { "portable" };

    json!({
        "ok": true,
        "current": current,
        "latest": tag,
        "name": name,
        "notes": notes,
        "url": url,
        "prerelease": prerelease,
        "hasUpdate": parse_ver(&tag) > parse_ver(&current),
        "channel": channel,
        "installerUrl": installer_url,
    })
}

/// Pick the best Windows installer asset from a release, preferring the NSIS
/// `-setup.exe` (per-user, no UAC, updates in place) over the MSI.
fn pick_installer(body: &Value) -> String {
    let Some(assets) = body.get("assets").and_then(|a| a.as_array()) else {
        return String::new();
    };
    // Pass 1: NSIS `-setup.exe`. Pass 2: MSI.
    for want_exe in [true, false] {
        for a in assets {
            let name = a
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let url = a.get("browser_download_url").and_then(|v| v.as_str()).unwrap_or("");
            if url.is_empty() {
                continue;
            }
            let hit = if want_exe {
                name.ends_with(".exe") && name.contains("setup")
            } else {
                name.ends_with(".msi")
            };
            if hit {
                return url.to_string();
            }
        }
    }
    String::new()
}

/// Heuristic: is this an installed build (so it can self-update) vs a portable
/// exe (which can't be updated in place — the launcher sends it to the release
/// page instead)? NSIS drops an `uninstall.exe` beside the app; MSI / per-machine
/// installs live under Program Files. A portable exe run from Downloads/Desktop/
/// USB matches neither.
/// ponytail: path/uninstaller heuristic — tighten if a real build slips through.
fn is_installed() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    if let Some(dir) = exe.parent() {
        if dir.join("uninstall.exe").exists() {
            return true;
        }
    }
    exe.to_string_lossy().to_lowercase().contains("\\program files")
}

/// Download this repo's latest release installer, launch it, then quit so it can
/// replace the running executable. Only meaningful for installed builds (see
/// `is_installed`). The installer URL is resolved server-side from GitHub — it is
/// deliberately NOT accepted from the frontend, so a compromised renderer can't
/// make the app download and execute an arbitrary binary.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Value {
    let res = tauri::async_runtime::spawn_blocking(fetch_and_launch)
        .await
        .unwrap_or_else(|_| Err("join error".to_string()));
    match res {
        Ok(()) => {
            // Exit so the just-launched installer can replace the running exe.
            // ponytail: NSIS silent closes/replaces the app; if a given machine
            // doesn't auto-relaunch, the user reopens once.
            app.exit(0);
            json!({ "ok": true })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

/// Only https downloads from this repo's own GitHub release assets are allowed.
fn is_allowed_installer_url(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(u) => {
            u.scheme() == "https"
                && u.host_str() == Some("github.com")
                && u.path().starts_with(&format!("/{REPO}/releases/"))
        }
        Err(_) => false,
    }
}

fn fetch_and_launch() -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .user_agent(format!("HomePad/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;

    // Re-fetch and re-derive the installer URL here rather than trusting one
    // passed in from the UI.
    let api = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let body: Value = client
        .get(&api)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    let url = pick_installer(&body);
    if url.is_empty() {
        return Err("No installer available for this release".into());
    }
    if !is_allowed_installer_url(&url) {
        return Err("Refusing to run an installer from an unexpected URL".into());
    }

    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Download failed (HTTP {})", resp.status()));
    }
    let bytes = resp.bytes().map_err(|e| e.to_string())?;

    // Fixed, sanitized filename — never derived from the (untrusted) URL, so it
    // can't traverse out of the temp dir.
    let fname = if url.to_lowercase().ends_with(".msi") {
        "HomePad-update.msi"
    } else {
        "HomePad-update.exe"
    };
    let path = std::env::temp_dir().join(fname);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    launch_installer(&path)
}

#[cfg(windows)]
fn launch_installer(path: &Path) -> Result<(), String> {
    use std::process::Command;
    let is_msi = path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("msi"))
        .unwrap_or(false);
    let spawn = if is_msi {
        Command::new("msiexec").arg("/i").arg(path).arg("/qb").spawn()
    } else {
        // NSIS silent install; Tauri's installer closes the running app first.
        Command::new(path).arg("/S").spawn()
    };
    spawn.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn launch_installer(_path: &Path) -> Result<(), String> {
    Err("Auto-update is only supported on Windows".into())
}

use crate::settings::{emulator_path, read_settings};
use crate::state::AppState;
use crate::util::expand_env;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::State;

// %APPDATA% folder names used by Switch (Yuzu-family) emulators.
const SWITCH_APPDATA_DIRS: &[&str] = &["eden", "citron", "sudachi", "suyu", "torzu", "yuzu"];

fn appdata_roaming() -> Option<PathBuf> {
    std::env::var("APPDATA").ok().map(PathBuf::from)
}

fn keys_dir(data: &str) -> PathBuf {
    Path::new(data).join("keys")
}

/// Firmware lives in the system NAND registered content cache.
fn firmware_dir(data: &str) -> PathBuf {
    Path::new(data)
        .join("nand")
        .join("system")
        .join("Contents")
        .join("registered")
}

/// Candidate Switch data directories: a portable `user/` folder next to the
/// configured emulator, then the known %APPDATA% emulator folders. Only dirs
/// that actually exist are returned, de-duplicated and in priority order.
fn switch_data_candidates() -> Vec<String> {
    let mut out: Vec<PathBuf> = Vec::new();
    let settings = read_settings();
    if let Some(emu) = emulator_path(&settings, "Nintendo Switch") {
        let emu = expand_env(&emu);
        out.push(Path::new(&emu).join("user"));
    }
    if let Some(roaming) = appdata_roaming() {
        for name in SWITCH_APPDATA_DIRS {
            out.push(roaming.join(name));
        }
    }
    let mut seen = HashSet::new();
    out.into_iter()
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().to_string())
        .filter(|s| seen.insert(s.clone()))
        .collect()
}

/// Resolve the data dir from an optional UI value, falling back to the saved
/// `emulator.switchDataDir`. Returns an env-expanded path (may be empty).
fn resolve_data_dir(data_dir: Option<String>) -> String {
    match data_dir {
        Some(d) if !d.trim().is_empty() => expand_env(d.trim()),
        _ => {
            let settings = read_settings();
            settings
                .get("emulator")
                .and_then(|e| e.get("switchDataDir"))
                .and_then(|v| v.as_str())
                .map(expand_env)
                .unwrap_or_default()
        }
    }
}

fn count_nca(dir: &Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .and_then(|x| x.to_str())
                        .map(|x| x.eq_ignore_ascii_case("nca"))
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn collect_nca_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                collect_nca_files(&p, out);
            } else if p
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("nca"))
                .unwrap_or(false)
            {
                out.push(p);
            }
        }
    }
}

/// Rotating auto-detect of the Switch data folder (mirrors suggest_3ds_nand).
#[tauri::command]
pub fn suggest_switch_data_dir(state: State<AppState>) -> String {
    let found = switch_data_candidates();
    if found.is_empty() {
        return String::new();
    }
    let list_key = serde_json::to_string(&found).unwrap_or_default();
    let mut cyc = state.switch_cycle.lock().unwrap();
    if cyc.list_key == list_key {
        cyc.idx = (cyc.idx + 1) % (found.len() as i64);
    } else {
        cyc.list_key = list_key;
        cyc.idx = 0;
    }
    found.get(cyc.idx as usize).cloned().unwrap_or_default()
}

/// Report what is currently installed in the given (or saved) data folder.
#[tauri::command]
pub fn switch_install_status(data_dir: Option<String>) -> Value {
    let data = resolve_data_dir(data_dir);
    if data.is_empty() {
        return json!({ "dataDir": "", "valid": false });
    }
    let kdir = keys_dir(&data);
    let fdir = firmware_dir(&data);
    json!({
        "dataDir": data,
        "valid": true,
        "keysDir": kdir.to_string_lossy(),
        "firmwareDir": fdir.to_string_lossy(),
        "prodKeys": kdir.join("prod.keys").is_file(),
        "titleKeys": kdir.join("title.keys").is_file(),
        "firmwareCount": count_nca(&fdir),
    })
}

/// Copy decryption keys (prod.keys + optional title.keys / key_retail.bin) into
/// the data folder's `keys/` directory. `source` may be a `.keys` file or a
/// folder containing prod.keys.
#[tauri::command]
pub fn install_switch_keys(data_dir: String, source: String) -> Value {
    let data = resolve_data_dir(Some(data_dir));
    if data.is_empty() {
        return json!({ "ok": false, "error": "Switch data folder not set" });
    }
    let src = expand_env(source.trim());
    let src_path = Path::new(&src);

    // Locate prod.keys and the directory to look for siblings in.
    let (src_dir, prod_file) = if src_path.is_dir() {
        let p = src_path.join("prod.keys");
        (src_path.to_path_buf(), p.is_file().then_some(p))
    } else if src_path.is_file() {
        let parent = src_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        (parent, Some(src_path.to_path_buf()))
    } else {
        return json!({ "ok": false, "error": "Selected keys path does not exist" });
    };

    let prod = match prod_file {
        Some(p) => p,
        None => return json!({ "ok": false, "error": "prod.keys not found at the selected location" }),
    };

    let kdir = keys_dir(&data);
    if let Err(e) = std::fs::create_dir_all(&kdir) {
        return json!({ "ok": false, "error": format!("Failed to create keys folder: {e}") });
    }

    // The selected file is installed as prod.keys regardless of its name.
    if let Err(e) = std::fs::copy(&prod, kdir.join("prod.keys")) {
        return json!({ "ok": false, "error": format!("Failed to copy prod.keys: {e}") });
    }
    let mut installed = vec!["prod.keys".to_string()];
    for name in ["title.keys", "key_retail.bin"] {
        let s = src_dir.join(name);
        if s.is_file() && std::fs::copy(&s, kdir.join(name)).is_ok() {
            installed.push(name.to_string());
        }
    }
    json!({ "ok": true, "installed": installed })
}

/// Install Switch firmware: replace the registered content cache with the
/// `.nca` files found (recursively) under `source`.
#[tauri::command]
pub fn install_switch_firmware(data_dir: String, source: String) -> Value {
    let data = resolve_data_dir(Some(data_dir));
    if data.is_empty() {
        return json!({ "ok": false, "error": "Switch data folder not set" });
    }
    let src = expand_env(source.trim());
    let src_path = Path::new(&src);
    if !src_path.is_dir() {
        return json!({ "ok": false, "error": "Select the folder that contains the firmware .nca files" });
    }
    let mut ncas: Vec<PathBuf> = Vec::new();
    collect_nca_files(src_path, &mut ncas);
    if ncas.is_empty() {
        return json!({ "ok": false, "error": "No .nca files found in the selected folder" });
    }

    let fdir = firmware_dir(&data);
    if let Err(e) = std::fs::create_dir_all(&fdir) {
        return json!({ "ok": false, "error": format!("Failed to create firmware folder: {e}") });
    }
    // Replace, don't merge: clear the existing registered cache first.
    if let Ok(rd) = std::fs::read_dir(&fdir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                let _ = std::fs::remove_dir_all(&p);
            } else {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
    let mut installed = 0usize;
    for nca in &ncas {
        let dest = fdir.join(nca.file_name().unwrap_or_default());
        if let Err(e) = std::fs::copy(nca, &dest) {
            return json!({ "ok": false, "error": format!("Failed to copy a firmware file: {e}") });
        }
        installed += 1;
    }
    json!({ "ok": true, "installed": installed })
}

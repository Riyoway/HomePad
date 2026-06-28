use crate::settings::{emulator_path, read_settings};
use crate::state::AppState;
use crate::util::expand_env;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::State;

// %APPDATA% folder names used by 3DS (Citra-family) emulators.
const THREEDS_APPDATA_DIRS: &[&str] = &["Borked3DS", "Azahar", "Citra"];

// System files Borked3DS/Citra loads from `<data>/sysdata`.
const SYSDATA_FILES: &[&str] = &[
    "aes_keys.txt",
    "boot9.bin",
    "boot9_prot.bin",
    "sector0x96.bin",
    "secret_sector.bin",
    "seeddb.bin",
    "shared_font.bin",
];

fn appdata_roaming() -> Option<PathBuf> {
    std::env::var("APPDATA").ok().map(PathBuf::from)
}

fn sysdata_dir(data: &str) -> PathBuf {
    Path::new(data).join("sysdata")
}

/// Candidate 3DS user/data directories: a portable `user/` folder next to the
/// configured emulator, then the known %APPDATA% emulator folders. Only dirs
/// that actually exist are returned, de-duplicated and in priority order.
fn threeds_data_candidates() -> Vec<String> {
    let mut out: Vec<PathBuf> = Vec::new();
    let settings = read_settings();
    if let Some(emu) = emulator_path(&settings, "Nintendo 3DS") {
        let emu = expand_env(&emu);
        out.push(Path::new(&emu).join("user"));
    }
    if let Some(roaming) = appdata_roaming() {
        for name in THREEDS_APPDATA_DIRS {
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
/// `emulator.threeDsDataDir`. Returns an env-expanded path (may be empty).
fn resolve_data_dir(data_dir: Option<String>) -> String {
    match data_dir {
        Some(d) if !d.trim().is_empty() => expand_env(d.trim()),
        _ => {
            let settings = read_settings();
            settings
                .get("emulator")
                .and_then(|e| e.get("threeDsDataDir"))
                .and_then(|v| v.as_str())
                .map(expand_env)
                .unwrap_or_default()
        }
    }
}

/// Rotating auto-detect of the 3DS data folder (mirrors suggest_3ds_nand).
#[tauri::command]
pub fn suggest_3ds_data_dir(state: State<AppState>) -> String {
    let found = threeds_data_candidates();
    if found.is_empty() {
        return String::new();
    }
    let list_key = serde_json::to_string(&found).unwrap_or_default();
    let mut cyc = state.threeds_cycle.lock().unwrap();
    if cyc.list_key == list_key {
        cyc.idx = (cyc.idx + 1) % (found.len() as i64);
    } else {
        cyc.list_key = list_key;
        cyc.idx = 0;
    }
    found.get(cyc.idx as usize).cloned().unwrap_or_default()
}

/// Report which system files are present in the data folder's `sysdata`.
#[tauri::command]
pub fn three_ds_install_status(data_dir: Option<String>) -> Value {
    let data = resolve_data_dir(data_dir);
    if data.is_empty() {
        return json!({ "dataDir": "", "valid": false });
    }
    let sd = sysdata_dir(&data);
    json!({
        "dataDir": data,
        "valid": true,
        "sysdataDir": sd.to_string_lossy(),
        "boot9": sd.join("boot9.bin").is_file() || sd.join("boot9_prot.bin").is_file(),
        "aesKeys": sd.join("aes_keys.txt").is_file(),
        "seeddb": sd.join("seeddb.bin").is_file(),
        "sharedFont": sd.join("shared_font.bin").is_file(),
    })
}

/// Install 3DS system files (boot9.bin, aes_keys.txt, seeddb.bin, shared_font…)
/// into `<data>/sysdata`. `source` may be one of those files or a folder that
/// contains them; every recognised file found alongside is copied.
#[tauri::command]
pub fn install_3ds_keys(data_dir: String, source: String) -> Value {
    let data = resolve_data_dir(Some(data_dir));
    if data.is_empty() {
        return json!({ "ok": false, "error": "3DS data folder not set" });
    }
    let src = expand_env(source.trim());
    let src_path = Path::new(&src);
    let src_dir = if src_path.is_dir() {
        src_path.to_path_buf()
    } else if src_path.is_file() {
        src_path.parent().map(Path::to_path_buf).unwrap_or_default()
    } else {
        return json!({ "ok": false, "error": "Selected path does not exist" });
    };

    let sd = sysdata_dir(&data);
    if let Err(e) = std::fs::create_dir_all(&sd) {
        return json!({ "ok": false, "error": format!("Failed to create sysdata folder: {e}") });
    }

    let mut installed: Vec<String> = Vec::new();
    for name in SYSDATA_FILES {
        let s = src_dir.join(name);
        if s.is_file() && std::fs::copy(&s, sd.join(name)).is_ok() {
            installed.push((*name).to_string());
        }
    }
    if installed.is_empty() {
        return json!({
            "ok": false,
            "error": "No 3DS system files (boot9.bin, aes_keys.txt, …) found at the selected location"
        });
    }
    json!({ "ok": true, "installed": installed })
}

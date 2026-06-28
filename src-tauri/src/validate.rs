use crate::homemenu::{
    find_cemu_settings_path, resolve_3ds_home, resolve_3ds_home_detailed, resolve_wiiu_home,
    resolve_wiiu_home_detailed, resolve_wiiu_mlc, write_wiiu_mlc,
};
use crate::settings::{emulator_path, read_settings};
use crate::state::AppState;
use crate::systems::systems;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::State;

fn rel_for(system: &str) -> Value {
    systems()
        .get(system)
        .and_then(|v| v.get("homeMenu"))
        .cloned()
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn suggest_3ds_nand(state: State<AppState>) -> String {
    let appdata = std::env::var("APPDATA").ok();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(ad) = &appdata {
        candidates.push(Path::new(ad).join("Borked3DS").join("nand"));
        candidates.push(Path::new(ad).join("Citra").join("nand"));
        candidates.push(Path::new(ad).join("Azahar").join("nand"));
    }
    let found: Vec<String> = candidates
        .into_iter()
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    if found.is_empty() {
        return String::new();
    }
    let list_key = serde_json::to_string(&found).unwrap_or_default();
    let mut cyc = state.nand_cycle.lock().unwrap();
    if cyc.list_key == list_key {
        cyc.idx = (cyc.idx + 1) % (found.len() as i64);
    } else {
        cyc.list_key = list_key;
        cyc.idx = 0;
    }
    found.get(cyc.idx as usize).cloned().unwrap_or_default()
}

#[tauri::command]
pub fn validate_3ds_nand(nand_dir: String) -> Value {
    if nand_dir.is_empty() {
        return json!({ "ok": false, "error": "NAND folder not set" });
    }
    let rel = rel_for("Nintendo 3DS");
    match resolve_3ds_home(&nand_dir, &rel) {
        Some(p) if Path::new(&p).is_file() => json!({ "ok": true, "path": p }),
        _ => json!({ "ok": false, "error": "3DS Home Menu file not found in NAND" }),
    }
}

/// Report whether the 3DS Home Menu app needed to boot the Home System exists
/// in the NAND, and if so which region/title it is.
#[tauri::command]
pub fn three_ds_home_status(nand_dir: Option<String>) -> serde_json::Value {
    let nand_dir = match nand_dir {
        Some(d) if !d.trim().is_empty() => d,
        _ => {
            let settings = read_settings();
            settings
                .get("emulator")
                .and_then(|e| e.get("nandDir"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
    };
    let rel = rel_for("Nintendo 3DS");
    match resolve_3ds_home_detailed(&nand_dir, &rel) {
        Some((region, label, title_id, path)) => json!({
            "found": true,
            "region": region,
            "regionLabel": label,
            "titleId": title_id,
            "path": path,
        }),
        None => json!({ "found": false }),
    }
}

#[tauri::command]
pub fn validate_wiiu_home(emu_dir: String) -> Value {
    if emu_dir.is_empty() {
        return json!({ "ok": false, "error": "Wii U emulator folder not set" });
    }
    if resolve_wiiu_mlc(&emu_dir).is_none() {
        return json!({ "ok": false, "error": "Cemu settings.xml / mlc_path not found (emulator folder or AppData)" });
    }
    let rel = rel_for("Nintendo Wii U");
    match resolve_wiiu_home(&emu_dir, &rel) {
        Some(p) => json!({ "ok": true, "path": p }),
        None => json!({ "ok": false, "error": "Wii U Home Menu men.rpx not found in any region (check mlc_path)" }),
    }
}

#[tauri::command]
pub fn get_wiiu_mlc_path() -> String {
    let settings = read_settings();
    let emu_dir = emulator_path(&settings, "Nintendo Wii U").unwrap_or_default();
    resolve_wiiu_mlc(&emu_dir).unwrap_or_default()
}

/// Return the mlc_path currently stored in settings.xml together with the
/// path of the settings.xml file itself so the frontend can display it.
///
/// `emu_dir` lets the caller pass the emulator folder currently entered in
/// the UI (before it is saved); when omitted or empty, the saved Wii U
/// emulator path is used instead.
#[tauri::command]
pub fn get_wiiu_mlc_info(emu_dir: Option<String>) -> serde_json::Value {
    let emu_dir = match emu_dir {
        Some(d) if !d.trim().is_empty() => d,
        _ => {
            let settings = read_settings();
            emulator_path(&settings, "Nintendo Wii U").unwrap_or_default()
        }
    };
    let xml_path = find_cemu_settings_path(&emu_dir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let mlc = resolve_wiiu_mlc(&emu_dir).unwrap_or_default();
    serde_json::json!({ "xmlPath": xml_path, "mlcPath": mlc })
}

/// Report whether the Wii U Home Menu (men.rpx) needed to boot the Home System
/// exists under the MLC, and if so which region/title it is.
#[tauri::command]
pub fn wiiu_home_status(emu_dir: Option<String>) -> serde_json::Value {
    let emu_dir = match emu_dir {
        Some(d) if !d.trim().is_empty() => d,
        _ => {
            let settings = read_settings();
            emulator_path(&settings, "Nintendo Wii U").unwrap_or_default()
        }
    };
    let rel = rel_for("Nintendo Wii U");
    match resolve_wiiu_home_detailed(&emu_dir, &rel) {
        Some((region, label, title_id, path)) => json!({
            "found": true,
            "region": region,
            "regionLabel": label,
            "titleId": title_id,
            "path": path,
        }),
        None => json!({ "found": false }),
    }
}

/// Write a new mlc_path value into Cemu's settings.xml.
#[tauri::command]
pub fn set_wiiu_mlc_path(mlc_path: String) -> serde_json::Value {
    let settings = read_settings();
    let emu_dir = emulator_path(&settings, "Nintendo Wii U").unwrap_or_default();
    match find_cemu_settings_path(&emu_dir) {
        None => serde_json::json!({ "ok": false, "error": "Cemu settings.xml not found" }),
        Some(xml_path) => match write_wiiu_mlc(&xml_path, &mlc_path) {
            Ok(()) => serde_json::json!({ "ok": true }),
            Err(e) => serde_json::json!({ "ok": false, "error": e }),
        },
    }
}

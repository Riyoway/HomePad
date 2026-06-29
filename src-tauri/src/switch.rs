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

// ---- Switch Home Menu (qlaunch) resolution ------------------------------
// Emulators without a `-qlaunch` CLI flag (e.g. Citron) can still boot the
// Home Menu if handed the qlaunch program NCA file directly. The registered
// firmware names NCAs by content-id hash, so the only way to find qlaunch is
// to read each NCA's encrypted header (title id + content type). That needs
// just the `header_key` and an AES-128-XTS decrypt of the 0x200-byte header
// sector — far lighter than full CNMT/RomFS parsing.

const QLAUNCH_TITLE_ID: u64 = 0x0100000000001000;

fn hex_to_bytes(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.is_empty() || s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

/// Read the 32-byte `header_key` from `<data>/keys/prod.keys`.
fn read_header_key(data_dir: &str) -> Option<[u8; 32]> {
    let text = std::fs::read_to_string(keys_dir(data_dir).join("prod.keys")).ok()?;
    for line in text.lines() {
        if let Some((k, v)) = line.split_once('=') {
            if k.trim().eq_ignore_ascii_case("header_key") {
                let bytes = hex_to_bytes(v)?;
                if bytes.len() == 32 {
                    let mut out = [0u8; 32];
                    out.copy_from_slice(&bytes);
                    return Some(out);
                }
            }
        }
    }
    None
}

/// Decrypt the NCA header (sector 1) and return `(title_id, content_type)`.
fn nca_header_info(path: &Path, header_key: &[u8; 32]) -> Option<(u64, u8)> {
    use aes::cipher::KeyInit;
    use aes::Aes128;
    use std::io::Read;
    use xts_mode::Xts128;

    let mut head = [0u8; 0x400];
    std::fs::File::open(path).ok()?.read_exact(&mut head).ok()?;
    let mut sector = [0u8; 0x200];
    sector.copy_from_slice(&head[0x200..0x400]);

    let cipher_1 = Aes128::new_from_slice(&header_key[0..16]).ok()?;
    let cipher_2 = Aes128::new_from_slice(&header_key[16..32]).ok()?;
    let xts = Xts128::<Aes128>::new(cipher_1, cipher_2);
    // NCA header XTS: 0x200-byte sectors, tweak = sector index as a 128-bit
    // big-endian counter. The header begins at sector 0, so offset 0x200 is
    // sector 1 -> the last tweak byte is 1.
    let mut tweak = [0u8; 16];
    tweak[15] = 1;
    xts.decrypt_sector(&mut sector, tweak);

    if &sector[0..4] != b"NCA3" && &sector[0..4] != b"NCA2" {
        return None;
    }
    let content_type = sector[0x05];
    let title_id = u64::from_le_bytes(sector[0x10..0x18].try_into().ok()?);
    Some((title_id, content_type))
}

/// Locate the qlaunch (Home Menu) program NCA file inside the data folder's
/// registered firmware. Returns the full path, or None if not found / no keys.
pub fn resolve_qlaunch_nca(data_dir: &str) -> Option<String> {
    let header_key = read_header_key(data_dir)?;
    let mut ncas: Vec<PathBuf> = Vec::new();
    collect_nca_files(&firmware_dir(data_dir), &mut ncas);
    for nca in &ncas {
        if nca.to_string_lossy().to_lowercase().ends_with(".cnmt.nca") {
            continue; // metadata, never the bootable program
        }
        if let Some((title_id, content_type)) = nca_header_info(nca, &header_key) {
            if title_id == QLAUNCH_TITLE_ID && content_type == 0 {
                return Some(nca.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Resolve the data folder for a specific Switch emulator launch: a portable
/// `user/` next to the emulator, else `%APPDATA%/<emu_id>`. Requires an
/// installed NAND.
pub fn switch_data_dir_for(emu_dir: &str, emu_id: &str) -> Option<String> {
    let portable = Path::new(emu_dir).join("user");
    if portable.join("nand").is_dir() {
        return Some(portable.to_string_lossy().to_string());
    }
    if !emu_id.is_empty() {
        if let Some(roaming) = appdata_roaming() {
            let p = roaming.join(emu_id);
            if p.join("nand").is_dir() {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod qlaunch_tests {
    use super::*;

    #[test]
    fn resolve_citron_qlaunch() {
        let roaming = match std::env::var("APPDATA") {
            Ok(v) => v,
            Err(_) => return,
        };
        let data_path = Path::new(&roaming).join("citron");
        let data = data_path.to_string_lossy().to_string();
        if !data_path.join("nand").is_dir() {
            eprintln!("[skip] citron data dir not present: {data}");
            return;
        }
        let key = read_header_key(&data);
        eprintln!("header_key present: {}", key.is_some());
        let known = data_path
            .join("nand")
            .join("system")
            .join("Contents")
            .join("registered")
            .join("9ACDAFDFC424AA2E9B155E7C8C3659C7.nca");
        if let Some(k) = key {
            if known.is_file() {
                let info = nca_header_info(&known, &k);
                eprintln!("known NCA -> {:?}", info.map(|(t, c)| (format!("{t:#018x}"), c)));
                assert_eq!(info, Some((QLAUNCH_TITLE_ID, 0)));
            }
        }
        let res = resolve_qlaunch_nca(&data);
        eprintln!("resolve_qlaunch_nca -> {:?}", res);
        assert!(res.is_some(), "qlaunch NCA not resolved");
    }
}


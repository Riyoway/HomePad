use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const DEFAULT_TOML: &str = include_str!("../resources/melonDS.toml");

static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn cfg_path(emu_dir: &str) -> PathBuf {
    Path::new(emu_dir).join("melonDS.toml")
}

fn valid_dir(emu_dir: &str) -> bool {
    !emu_dir.is_empty()
        && std::fs::metadata(emu_dir)
            .map(|m| m.is_dir())
            .unwrap_or(false)
}

fn toml_to_json(raw: &str) -> Result<Value, String> {
    let doc: toml::Value = raw.parse::<toml::Value>().map_err(|e| e.to_string())?;
    serde_json::to_value(doc).map_err(|e| e.to_string())
}

pub fn ensure(emu_dir: &str) -> Value {
    if !valid_dir(emu_dir) {
        return json!({ "ok": false, "error": "Emulator directory not found" });
    }
    let path = cfg_path(emu_dir);
    if !path.exists() {
        match std::fs::write(&path, DEFAULT_TOML) {
            Ok(_) => json!({ "ok": true, "created": true, "path": path.to_string_lossy() }),
            Err(e) => json!({ "ok": false, "error": format!("Failed to write default melonDS.toml: {e}") }),
        }
    } else {
        json!({ "ok": true, "created": false, "path": path.to_string_lossy() })
    }
}

pub fn read(emu_dir: &str) -> Value {
    let path = cfg_path(emu_dir);
    if !path.exists() {
        return json!({ "ok": false, "error": "melonDS.toml not found" });
    }
    match std::fs::read_to_string(&path) {
        Ok(raw) => match toml_to_json(&raw) {
            Ok(data) => json!({ "ok": true, "data": data, "path": path.to_string_lossy() }),
            Err(e) => json!({ "ok": false, "error": e }),
        },
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}

fn sanitize_patch(patch: &Value) -> Map<String, Value> {
    let mut out = Map::new();
    let Some(obj) = patch.as_object() else {
        return out;
    };
    for (k, v) in obj {
        let low = k.to_lowercase();
        if low == "ds" || low == "dsi" {
            let norm = if low == "dsi" { "DSi" } else { "DS" };
            let mut section = Map::new();
            if let Some(src) = v.as_object() {
                for (sk, sv) in src {
                    let val = match sv {
                        Value::String(s) => {
                            let t = s.trim();
                            if t.is_empty() {
                                continue;
                            }
                            Value::String(t.to_string())
                        }
                        Value::Null => continue,
                        other => other.clone(),
                    };
                    section.insert(sk.clone(), val);
                }
            }
            if !section.is_empty() {
                out.insert(norm.to_string(), Value::Object(section));
            }
        } else {
            out.insert(k.clone(), v.clone());
        }
    }
    out
}

fn merge_section(target: &mut Map<String, Value>, key: &str, patch: &Value) {
    let entry = target
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    if let (Some(dst), Some(src)) = (entry.as_object_mut(), patch.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
    }
}

pub fn write(emu_dir: &str, patch: &Value) -> Value {
    if !valid_dir(emu_dir) {
        return json!({ "ok": false, "error": "Emulator directory not found" });
    }
    let _write_guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = cfg_path(emu_dir);
    let sanitized = sanitize_patch(patch);

    let mut data: Map<String, Value> = if path.exists() {
        match std::fs::read_to_string(&path) {
            Ok(raw) => match toml_to_json(&raw) {
                Ok(Value::Object(m)) => m,
                Ok(_) => Map::new(),
                Err(e) => {
                    let bak = path.with_extension("parse-error.bak.toml");
                    let _ = std::fs::write(&bak, &raw);
                    return json!({ "ok": false, "error": format!("Existing melonDS.toml could not be parsed: {e}") });
                }
            },
            Err(e) => return json!({ "ok": false, "error": format!("Failed to read melonDS.toml: {e}") }),
        }
    } else {
        Map::new()
    };

    for (k, v) in &sanitized {
        if k == "DS" || k == "DSi" || k == "Emu" {
            merge_section(&mut data, k, v);
        } else {
            data.insert(k.clone(), v.clone());
        }
    }

    let merged = Value::Object(data);
    let toml_value = match toml::Value::try_from(&merged) {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": format!("Failed to encode melonDS.toml: {e}") }),
    };
    let body = match toml::to_string(&toml_value) {
        Ok(s) => s,
        Err(e) => return json!({ "ok": false, "error": format!("Failed to serialize melonDS.toml: {e}") }),
    };
    let normalized = body
        .split('\n')
        .map(|line| line.trim_start_matches([' ', '\t']).trim_end_matches('\r'))
        .collect::<Vec<_>>()
        .join("\r\n");

    let tmp = path.with_extension("toml.tmp");
    if let Err(e) = std::fs::write(&tmp, normalized.as_bytes()) {
        return json!({ "ok": false, "error": format!("Failed to write melonDS.toml: {e}") });
    }
    if let Err(e) = std::fs::rename(&tmp, &path) {
        return json!({ "ok": false, "error": format!("Failed to write melonDS.toml: {e}") });
    }
    json!({ "ok": true, "path": path.to_string_lossy() })
}

pub fn validate(emu_dir: &str, system_name: &str) -> Value {
    let ensured = ensure(emu_dir);
    if ensured.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return ensured;
    }
    let path = cfg_path(emu_dir);
    let raw = match std::fs::read_to_string(&path) {
        Ok(r) => r,
        Err(_) => return json!({ "ok": false, "error": "Please set valid BIOS/Firmware/NAND .bin paths in Settings or the melonDS emulator settings." }),
    };
    let data = match toml_to_json(&raw) {
        Ok(d) => d,
        Err(_) => return json!({ "ok": false, "error": "Please set valid BIOS/Firmware/NAND .bin paths in Settings or the melonDS emulator settings." }),
    };

    let is_ds = system_name == "Nintendo DS";
    let section = if is_ds {
        data.get("DS").or_else(|| data.get("ds"))
    } else {
        data.get("DSi").or_else(|| data.get("dsi"))
    };
    let Some(section) = section.and_then(|s| s.as_object()) else {
        return json!({ "ok": false, "error": "Please set valid BIOS/Firmware/NAND .bin paths in Settings or the melonDS emulator settings." });
    };

    let req: &[&str] = if is_ds {
        &["BIOS9Path", "BIOS7Path", "FirmwarePath"]
    } else {
        &["BIOS9Path", "BIOS7Path", "FirmwarePath", "NANDPath"]
    };

    let get = |obj: &Map<String, Value>, k: &str| -> Option<String> {
        obj.get(k)
            .or_else(|| obj.get(&k.to_lowercase()))
            .or_else(|| obj.get(&k.to_uppercase()))
            .and_then(|v| v.as_str())
            .map(|s| s.trim_matches('"').to_string())
    };

    let mut missing: Vec<String> = Vec::new();
    for key in req {
        match get(section, key) {
            Some(p) if !p.is_empty() => {
                let ok = std::fs::metadata(&p).map(|m| m.is_file()).unwrap_or(false)
                    && p.to_lowercase().ends_with(".bin");
                if !ok {
                    missing.push((*key).to_string());
                }
            }
            _ => missing.push((*key).to_string()),
        }
    }
    if missing.is_empty() {
        json!({ "ok": true, "path": path.to_string_lossy() })
    } else {
        json!({ "ok": false, "error": "Required melonDS BIOS/Firmware/NAND file not found. Please check Settings or the melonDS emulator settings.", "missing": missing })
    }
}

#[tauri::command]
pub fn melonds_ensure_config(emu_dir: String) -> Value {
    if emu_dir.is_empty() {
        return json!({ "ok": false, "error": "Emulator folder not set" });
    }
    ensure(&emu_dir)
}

#[tauri::command]
pub fn melonds_read(emu_dir: String) -> Value {
    if emu_dir.is_empty() {
        return json!({ "ok": false, "error": "Emulator folder not set" });
    }
    read(&emu_dir)
}

#[tauri::command]
pub fn melonds_write(emu_dir: String, patch: Value) -> Value {
    if emu_dir.is_empty() {
        return json!({ "ok": false, "error": "Emulator folder not set" });
    }
    write(&emu_dir, &patch)
}

#[tauri::command]
pub fn melonds_validate(emu_dir: String, system_name: String) -> Value {
    if emu_dir.is_empty() {
        return json!({ "ok": false, "error": "Emulator folder not set" });
    }
    validate(&emu_dir, &system_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_roundtrip_stays_valid() {
        let dir = std::env::temp_dir().join(format!("homepad_melon_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let d = dir.to_string_lossy().to_string();

        let e = ensure(&d);
        assert_eq!(e.get("ok"), Some(&Value::Bool(true)), "ensure: {e:?}");

        let patch = json!({
            "DS": { "BIOS9Path": "C:/bios/bios9.bin", "BIOS7Path": "C:/bios/bios7.bin", "FirmwarePath": "C:/bios/fw.bin" },
            "Emu": { "ConsoleType": 0, "ExternalBIOSEnable": true }
        });
        let w = write(&d, &patch);
        assert_eq!(w.get("ok"), Some(&Value::Bool(true)), "write: {w:?}");

        let raw = std::fs::read_to_string(dir.join("melonDS.toml")).unwrap();
        let _parsed: toml::Value = raw.parse().expect("written TOML must be valid");

        let r = read(&d);
        assert_eq!(r["data"]["DS"]["BIOS9Path"], json!("C:/bios/bios9.bin"));
        assert_eq!(r["data"]["Emu"]["ConsoleType"], json!(0));

        let _ = std::fs::remove_dir_all(&dir);
    }
}

use serde_json::{json, Value};
use std::path::PathBuf;

const IDENTIFIER: &str = "com.riyo.homepad";

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join(IDENTIFIER)
}

pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

fn default_settings() -> Value {
    json!({
        "audio": {},
        "emulator": {},
        "display": {},
        "downloader": {},
        "discord": {}
    })
}

pub fn read_settings() -> Value {
    match std::fs::read_to_string(settings_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| default_settings()),
        Err(_) => default_settings(),
    }
}

pub fn write_settings(settings: &Value) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, body).map_err(|e| e.to_string())
}

pub fn emulator_path(settings: &Value, system: &str) -> Option<String> {
    settings
        .get("emulator")?
        .get("paths")?
        .get(system)?
        .as_str()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

pub fn emulator_mode(settings: &Value) -> String {
    settings
        .get("emulator")
        .and_then(|e| e.get("mode"))
        .and_then(|m| m.as_str())
        .unwrap_or("emulator")
        .to_string()
}

pub fn nand_dir(settings: &Value) -> Option<String> {
    settings
        .get("emulator")?
        .get("nandDir")?
        .as_str()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

pub fn after_launch(settings: &Value) -> String {
    settings
        .get("emulator")
        .and_then(|e| e.get("afterLaunch"))
        .and_then(|m| m.as_str())
        .unwrap_or("nothing")
        .to_string()
}

pub fn fullscreen_home(settings: &Value) -> bool {
    settings
        .get("emulator")
        .and_then(|e| e.get("fullscreenHome"))
        .and_then(|b| b.as_bool())
        .unwrap_or(false)
}

pub fn discord_enabled(settings: &Value) -> bool {
    settings
        .get("discord")
        .and_then(|d| d.get("enabled"))
        .and_then(|b| b.as_bool())
        != Some(false)
}

pub fn download_dir(settings: &Value) -> PathBuf {
    if let Some(dir) = settings
        .get("downloader")
        .and_then(|d| d.get("dir"))
        .and_then(|s| s.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        let expanded = crate::util::expand_env(dir);
        if !expanded.trim().is_empty() {
            return PathBuf::from(expanded);
        }
    }
    let base = std::env::var("LOCALAPPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(config_dir);
    base.join("HomePad").join("Emulators")
}

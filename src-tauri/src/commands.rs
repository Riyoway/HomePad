use crate::settings::{discord_enabled, read_settings, write_settings};
use crate::state::AppState;
use crate::systems::systems;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

pub fn emit_popup(app: &AppHandle, kind: &str, message: &str, duration: u32) {
    let _ = app.emit(
        "app-popup",
        json!({ "type": kind, "message": message, "duration": duration }),
    );
}

#[tauri::command]
pub fn get_config() -> Value {
    systems().clone()
}

#[tauri::command]
pub fn get_settings() -> Value {
    read_settings()
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Value) -> Value {
    match write_settings(&settings) {
        Ok(()) => {
            let want = discord_enabled(&settings);
            if let Ok(mut d) = state.discord.lock() {
                if want && !d.connected {
                    d.set_enabled(true);
                    d.init();
                } else if !want && d.connected {
                    d.shutdown();
                    d.set_enabled(false);
                }
            }
            json!({ "ok": true })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Value {
    if url.is_empty() {
        return json!({ "ok": false, "error": "Invalid URL" });
    }
    let lower = url.to_lowercase();

    if lower.starts_with("file://") {
        let path = reqwest::Url::parse(&url)
            .ok()
            .and_then(|u| u.to_file_path().ok())
            .unwrap_or_else(|| std::path::PathBuf::from(url.trim_start_matches("file://")));
        let is_dir = std::fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
        let res = if is_dir {
            app.opener()
                .open_path(path.to_string_lossy().to_string(), None::<&str>)
        } else {
            app.opener().reveal_item_in_dir(&path)
        };
        return match res {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        };
    }

    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("ms-settings:") {
        return match app.opener().open_url(url, None::<&str>) {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        };
    }

    json!({ "ok": false, "error": "Blocked scheme" })
}

#[tauri::command]
pub fn discord_status(state: State<AppState>) -> Value {
    match state.discord.lock() {
        Ok(d) => {
            let enabled = d.enabled;
            json!({
                "enabled": enabled,
                "connected": d.connected && enabled,
                "error": d.error && enabled,
            })
        }
        Err(_) => json!({ "enabled": false, "connected": false, "error": false }),
    }
}

#[tauri::command]
pub fn discord_retry(app: AppHandle, state: State<AppState>) -> Value {
    let enabled = discord_enabled(&read_settings());
    let Ok(mut d) = state.discord.lock() else {
        return json!({ "ok": false, "error": "discord-unavailable" });
    };
    d.set_enabled(enabled);
    if !enabled {
        drop(d);
        emit_popup(&app, "warning", "Discord RPC is disabled in Settings.", 2600);
        return json!({ "ok": false, "error": "disabled" });
    }
    d.shutdown();
    let ok = d.init();
    drop(d);
    if ok {
        emit_popup(&app, "success", "Reconnected to Discord RPC.", 2200);
        json!({ "ok": true })
    } else {
        emit_popup(&app, "error", "Discord RPC retry failed.", 3200);
        json!({ "ok": false, "error": "retry-failed" })
    }
}

mod commands;
mod dialogs;
mod discord;
mod downloader;
mod homemenu;
mod launcher;
mod melonds;
mod paths;
mod settings;
mod state;
mod sysstatus;
mod systems;
mod tray;
mod util;
mod validate;

use discord::DiscordManager;
use state::{AppState, DownloadState, NandCycle};
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let download = Arc::new(DownloadState::new());
    let initial = settings::read_settings();
    let discord_on = settings::discord_enabled(&initial);
    let discord = Arc::new(Mutex::new(DiscordManager::new(discord_on)));

    let setup_discord = discord.clone();

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_skip_taskbar(false);
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            nand_cycle: Mutex::new(NandCycle::default()),
            download,
            discord,
            launch_gen: Arc::new(AtomicU64::new(0)),
        })
        .setup(move |app| {
            if discord_on {
                if let Ok(mut d) = setup_discord.lock() {
                    d.init();
                }
            }
            sysstatus::start(app.handle().clone());
            if let Err(e) = tray::build(app) {
                eprintln!("[tray] failed to build: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::get_settings,
            commands::save_settings,
            commands::quit_app,
            commands::open_external,
            commands::discord_status,
            commands::discord_retry,
            commands::set_fullscreen,
            commands::get_fullscreen,
            paths::expand_path,
            paths::path_exists,
            validate::suggest_3ds_nand,
            validate::validate_3ds_nand,
            validate::validate_wiiu_home,
            validate::get_wiiu_mlc_path,
            validate::get_wiiu_mlc_info,
            validate::set_wiiu_mlc_path,
            dialogs::open_dir,
            dialogs::open_file,
            downloader::download_system,
            downloader::cancel_download,
            launcher::launch,
            launcher::launch_action,
            melonds::melonds_ensure_config,
            melonds::melonds_read,
            melonds::melonds_write,
            melonds::melonds_validate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HomePad");
}

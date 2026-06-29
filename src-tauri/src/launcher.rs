use crate::discord::DiscordManager;
use crate::homemenu::{resolve_3ds_home, resolve_wiiu_home};
use crate::melonds;
use crate::settings::{
    after_launch, emulator_mode, emulator_path, fullscreen_home, nand_dir, read_settings,
};
use crate::state::AppState;
use crate::systems::systems;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

const MSG_CHECK_PATH: &str = "Please check the emulator folder/path in Settings.";
const ERR_EMULATOR_EXE_NOT_FOUND: &str = "Emulator executable not found in the configured folder.";
const ERR_WIIU_HOME: &str = "Required files for launching the Wii U Home Menu were not found.";
const ERR_3DS_HOME: &str = "3DS Home Menu file not found. Check 3DS NAND folder in Settings.";
const ERR_SWITCH_DATA: &str =
    "Switch data folder not found. Set up the emulator (firmware/keys) in the Installer tab.";
const ERR_QLAUNCH: &str =
    "Home Menu (qlaunch) not found in the installed firmware. Install firmware and keys first.";

const HOME_TOKEN: &str = "${homeMenu}";
// Resolved at launch to the qlaunch (Home Menu) NCA path, for Switch emulators
// that lack a `-qlaunch` CLI flag (e.g. Citron).
const QLAUNCH_TOKEN: &str = "${qlaunch}";

struct LaunchPlan {
    exe_full: PathBuf,
    exe_name: String,
    args: Vec<String>,
    cwd: String,
}

fn str_array(args: Option<&Value>, key: &str) -> Vec<String> {
    args.and_then(|a| a.get(key))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn validate_before_home(system: &str, cwd: &str) -> Result<(), String> {
    if system == "Nintendo DS" || system == "Nintendo DSi" {
        let v = melonds::validate(cwd, system);
        if v.get("ok").and_then(|b| b.as_bool()) != Some(true) {
            return Err(v
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("melonDS configuration invalid")
                .to_string());
        }
    }
    Ok(())
}

fn resolve_home_target(system: &str, cwd: &str) -> Result<Option<String>, String> {
    let cfg = systems();
    match system {
        "Nintendo 3DS" => {
            let settings = read_settings();
            let nand = nand_dir(&settings).unwrap_or_default();
            let rel = cfg
                .get("Nintendo 3DS")
                .and_then(|v| v.get("homeMenu"))
                .cloned()
                .unwrap_or(Value::Null);
            resolve_3ds_home(&nand, &rel)
                .map(Some)
                .ok_or_else(|| ERR_3DS_HOME.to_string())
        }
        "Nintendo Wii U" => {
            let rel = cfg
                .get("Nintendo Wii U")
                .and_then(|v| v.get("homeMenu"))
                .cloned()
                .unwrap_or(Value::Null);
            resolve_wiiu_home(cwd, &rel)
                .map(Some)
                .ok_or_else(|| ERR_WIIU_HOME.to_string())
        }
        _ => Ok(None),
    }
}

fn post_build_adjust(system: &str, cwd: &str) {
    let (console_type, ext_bios) = match system {
        "Nintendo DS" => (0i64, true),
        "Nintendo DSi" => (1i64, false),
        _ => return,
    };
    let _ = melonds::ensure(cwd);
    let r = melonds::read(cwd);
    if r.get("ok").and_then(|b| b.as_bool()) != Some(true) {
        return;
    }
    let emu = r.get("data").and_then(|d| d.get("Emu"));
    let cur_ct = emu.and_then(|e| e.get("ConsoleType")).and_then(|v| v.as_i64());
    let cur_bios = emu
        .and_then(|e| e.get("ExternalBIOSEnable"))
        .and_then(|v| v.as_bool());
    let mut patch = Map::new();
    if cur_ct != Some(console_type) {
        patch.insert("ConsoleType".to_string(), json!(console_type));
    }
    if cur_bios != Some(ext_bios) {
        patch.insert("ExternalBIOSEnable".to_string(), json!(ext_bios));
    }
    if !patch.is_empty() {
        let _ = melonds::write(cwd, &json!({ "Emu": patch }));
    }
}

fn build_plan(
    system: &str,
    settings: &Value,
    forced_mode: Option<&str>,
) -> Result<LaunchPlan, String> {
    let cfg = systems();
    let sys = cfg.get(system).ok_or_else(|| MSG_CHECK_PATH.to_string())?;

    let mode = forced_mode
        .map(|m| m.to_string())
        .unwrap_or_else(|| emulator_mode(settings));
    let mut home_mode = mode == "home";

    let cwd = emulator_path(settings, system).ok_or_else(|| MSG_CHECK_PATH.to_string())?;
    if !Path::new(&cwd).is_dir() {
        return Err(MSG_CHECK_PATH.to_string());
    }

    let empty = Vec::new();
    let emus = sys
        .get("emulators")
        .and_then(|e| e.as_array())
        .unwrap_or(&empty);

    let selected = emus
        .iter()
        .find(|e| {
            e.get("exe")
                .and_then(|x| x.as_str())
                .map(|exe| Path::new(&cwd).join(exe).is_file())
                .unwrap_or(false)
        })
        .ok_or_else(|| ERR_EMULATOR_EXE_NOT_FOUND.to_string())?;

    let exe = selected.get("exe").and_then(|x| x.as_str()).unwrap_or("");
    if exe.is_empty() {
        return Err(ERR_EMULATOR_EXE_NOT_FOUND.to_string());
    }
    let args_obj = selected.get("args");

    let mut args = if home_mode {
        let sm = str_array(args_obj, "systemMenu");
        if sm.is_empty() {
            home_mode = false;
            str_array(args_obj, "emulator")
        } else {
            sm
        }
    } else {
        str_array(args_obj, "emulator")
    };

    if home_mode {
        validate_before_home(system, &cwd)?;

        if fullscreen_home(settings) {
            let fs = args_obj
                .and_then(|a| a.get("fullscreen"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if !fs.is_empty() {
                match args.iter().position(|a| a.contains(HOME_TOKEN)) {
                    Some(idx) => args.insert(idx, fs),
                    None => args.push(fs),
                }
            }
        }

        let needs_token = args.iter().any(|a| a.contains(HOME_TOKEN));
        if needs_token {
            let home = resolve_home_target(system, &cwd)?
                .ok_or_else(|| ERR_3DS_HOME.to_string())?;
            for a in args.iter_mut() {
                if a.contains(HOME_TOKEN) {
                    *a = a.replace(HOME_TOKEN, &home);
                }
            }
        } else {
            let _ = resolve_home_target(system, &cwd)?;
        }

        // ${qlaunch}: locate the Home Menu NCA in the emulator's installed
        // firmware and pass its path (for emulators without a -qlaunch flag).
        if args.iter().any(|a| a.contains(QLAUNCH_TOKEN)) {
            let emu_id = selected.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let data = crate::switch::switch_data_dir_for(&cwd, emu_id)
                .ok_or_else(|| ERR_SWITCH_DATA.to_string())?;
            let nca = crate::switch::resolve_qlaunch_nca(&data)
                .ok_or_else(|| ERR_QLAUNCH.to_string())?;
            for a in args.iter_mut() {
                if a.contains(QLAUNCH_TOKEN) {
                    *a = a.replace(QLAUNCH_TOKEN, &nca);
                }
            }
        }
    }

    for a in args.iter_mut() {
        *a = crate::util::expand_env(a);
    }

    let exe_full = Path::new(&cwd).join(exe);
    if !exe_full.is_file() {
        return Err(ERR_EMULATOR_EXE_NOT_FOUND.to_string());
    }

    post_build_adjust(system, &cwd);

    Ok(LaunchPlan {
        exe_full,
        exe_name: exe.to_string(),
        args,
        cwd,
    })
}

fn spawn_emulator(plan: &LaunchPlan) -> Result<(), String> {
    use std::process::Command;
    let mut c = Command::new(&plan.exe_full);
    c.args(&plan.args)
        .current_dir(&plan.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        c.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }
    c.spawn().map(|_| ()).map_err(|e| e.to_string())
}

const MONITOR_INTERVAL: Duration = Duration::from_millis(2500);
const PROCESS_END_GRACE: Duration = Duration::from_millis(1500);
const MONITOR_MAX_WAIT_FOR_START: Duration = Duration::from_secs(30);

fn start_process_monitor(
    discord: Arc<Mutex<DiscordManager>>,
    gen_counter: Arc<AtomicU64>,
    my_gen: u64,
    exe_name: String,
) {
    if exe_name.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        let target = exe_name.to_lowercase();
        let base = target.strip_suffix(".exe").unwrap_or(&target).to_string();
        let mut system = sysinfo::System::new();
        let mut was_alive = false;
        let mut last_seen = Instant::now();
        let started = Instant::now();
        loop {
            std::thread::sleep(MONITOR_INTERVAL);
            if gen_counter.load(Ordering::SeqCst) != my_gen {
                break;
            }
            system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            let alive = system.processes().values().any(|p| {
                let name = p.name().to_string_lossy().to_lowercase();
                name == target || (!base.is_empty() && name.contains(&base))
            });
            if alive {
                was_alive = true;
                last_seen = Instant::now();
            } else if was_alive && last_seen.elapsed() > PROCESS_END_GRACE {
                if gen_counter.load(Ordering::SeqCst) == my_gen {
                    if let Ok(mut d) = discord.lock() {
                        d.set_idle();
                    }
                }
                break;
            } else if !was_alive && started.elapsed() > MONITOR_MAX_WAIT_FOR_START {
                break;
            }
        }
    });
}

fn do_launch(app: &AppHandle, state: &AppState, system: &str, forced_mode: Option<&str>) -> Value {
    if systems().get(system).is_none() {
        return json!({ "ok": false, "error": MSG_CHECK_PATH });
    }
    let settings = read_settings();
    let plan = match build_plan(system, &settings, forced_mode) {
        Ok(p) => p,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let discord = state.discord.clone();

    match spawn_emulator(&plan) {
        Ok(()) => {
            if let Ok(mut d) = discord.lock() {
                d.set_playing(system);
            }
            let behavior = after_launch(&settings);
            let gen_counter = state.launch_gen.clone();
            let my_gen = gen_counter.fetch_add(1, Ordering::SeqCst) + 1;
            match behavior.as_str() {
                "exit" => {
                    app.exit(0);
                }
                "minimize" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                        let _ = w.set_skip_taskbar(true);
                    }
                    start_process_monitor(discord, gen_counter, my_gen, plan.exe_name.clone());
                }
                _ => {
                    start_process_monitor(discord, gen_counter, my_gen, plan.exe_name.clone());
                }
            }
            json!({ "ok": true })
        }
        Err(_) => {
            if let Ok(mut d) = discord.lock() {
                d.set_idle();
            }
            json!({ "ok": false, "error": MSG_CHECK_PATH })
        }
    }
}

#[tauri::command]
pub fn launch(app: AppHandle, state: State<AppState>, system_name: String) -> Value {
    do_launch(&app, &state, &system_name, None)
}

#[tauri::command]
pub fn launch_action(
    app: AppHandle,
    state: State<AppState>,
    system_name: String,
    action: String,
) -> Value {
    let forced = if action == "system-menu" {
        "home"
    } else {
        "emulator"
    };
    do_launch(&app, &state, &system_name, Some(forced))
}

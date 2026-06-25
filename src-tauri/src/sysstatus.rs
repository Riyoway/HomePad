use chrono::{Datelike, Local, Timelike};
use serde_json::json;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const POLL: Duration = Duration::from_millis(1500);

fn time_payload() -> serde_json::Value {
    let now = Local::now();
    json!({
        "hours": now.hour(),
        "minutes": now.minute(),
        "year": now.year(),
        "month": now.month(),
        "day": now.day(),
    })
}

#[cfg(windows)]
fn read_battery() -> (Option<f64>, bool, bool) {
    use starship_battery::{Manager, State};
    if let Ok(manager) = Manager::new() {
        if let Ok(mut batteries) = manager.batteries() {
            if let Some(Ok(bat)) = batteries.next() {
                let pct = (bat.state_of_charge().value as f64) * 100.0;
                let charging = matches!(bat.state(), State::Charging | State::Full);
                let on_battery = matches!(bat.state(), State::Discharging);
                return (Some(pct), charging, on_battery);
            }
        }
    }
    (None, false, false)
}

#[cfg(not(windows))]
fn read_battery() -> (Option<f64>, bool, bool) {
    (None, false, false)
}

fn quality_to_bars(q: i64) -> i64 {
    if q >= 80 {
        4
    } else if q >= 60 {
        3
    } else if q >= 40 {
        2
    } else if q >= 20 {
        1
    } else {
        0
    }
}

fn extract_percent(line: &str) -> Option<i64> {
    let bytes = line.as_bytes();
    for (i, &c) in bytes.iter().enumerate() {
        if c == b'%' {
            let mut j = i;
            while j > 0 && bytes[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j < i {
                if let Ok(v) = line[j..i].parse::<i64>() {
                    return Some(v);
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn read_wifi() -> (Option<i64>, i64) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout);
        for line in s.lines() {
            if let Some(q) = extract_percent(line) {
                let q = q.clamp(0, 100);
                return (Some(q), quality_to_bars(q));
            }
        }
    }
    (None, 0)
}

#[cfg(not(windows))]
fn read_wifi() -> (Option<i64>, i64) {
    (None, 0)
}

#[cfg(windows)]
fn read_volume() -> (Option<i64>, bool) {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    unsafe {
        let result = (|| -> windows::core::Result<(i64, bool)> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
            let scalar = endpoint.GetMasterVolumeLevelScalar()?;
            let muted = endpoint.GetMute()?.as_bool();
            Ok(((scalar * 100.0).round() as i64, muted))
        })();
        match result {
            Ok((v, m)) => (Some(v.clamp(0, 100)), m),
            Err(_) => (None, false),
        }
    }
}

#[cfg(not(windows))]
fn read_volume() -> (Option<i64>, bool) {
    (None, false)
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        loop {
            let (percent, is_charging, on_battery) = read_battery();
            let (quality, bars) = read_wifi();
            let (level, muted) = read_volume();

            let payload = json!({
                "time": time_payload(),
                "battery": { "percent": percent, "isCharging": is_charging },
                "wifi": { "quality": quality, "bars": bars },
                "volume": { "level": level, "muted": muted },
            });
            let _ = app.emit("sys-status", payload);
            let _ = app.emit("power-state", json!({ "onBattery": on_battery }));

            std::thread::sleep(POLL);
        }
    });
}

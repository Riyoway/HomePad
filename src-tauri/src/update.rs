use serde_json::{json, Value};
use std::time::Duration;

const REPO: &str = "Riyoway/HomePad";
const RELEASES_URL: &str = "https://github.com/Riyoway/HomePad/releases";

/// Parse a `vMAJOR.MINOR.PATCH`-style tag into a comparable tuple.
fn parse_ver(s: &str) -> (u64, u64, u64) {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let mut it = s.split(|c: char| !c.is_ascii_digit());
    let a = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let b = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let c = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    (a, b, c)
}

/// Check the GitHub "latest release" and compare it to the running version.
/// Async + spawn_blocking so the blocking HTTP call never runs on the UI thread
/// (a slow/firewalled network would otherwise freeze the whole app for ~20s).
#[tauri::command]
pub async fn check_update() -> Value {
    tauri::async_runtime::spawn_blocking(check_update_blocking)
        .await
        .unwrap_or_else(|_| {
            json!({ "ok": false, "error": "join error", "current": env!("CARGO_PKG_VERSION") })
        })
}

fn check_update_blocking() -> Value {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let api = format!("https://api.github.com/repos/{REPO}/releases/latest");

    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(20))
        .user_agent(format!("HomePad/{current}"))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "error": e.to_string(), "current": current }),
    };

    let resp = match client
        .get(&api)
        .header("Accept", "application/vnd.github+json")
        .send()
    {
        Ok(r) => r,
        Err(e) => return json!({ "ok": false, "error": e.to_string(), "current": current }),
    };

    // No published releases yet -> nothing to update to.
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return json!({
            "ok": true, "current": current, "latest": "",
            "hasUpdate": false, "noReleases": true, "url": RELEASES_URL
        });
    }
    if !resp.status().is_success() {
        return json!({ "ok": false, "error": format!("GitHub returned {}", resp.status()), "current": current });
    }

    let body: Value = match resp.json() {
        Ok(v) => v,
        Err(e) => return json!({ "ok": false, "error": e.to_string(), "current": current }),
    };

    let tag = body.get("tag_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let notes = body.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let url = body
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or(RELEASES_URL)
        .to_string();
    let prerelease = body.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false);

    json!({
        "ok": true,
        "current": current,
        "latest": tag,
        "name": name,
        "notes": notes,
        "url": url,
        "prerelease": prerelease,
        "hasUpdate": parse_ver(&tag) > parse_ver(&current),
    })
}

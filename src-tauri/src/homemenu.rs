use crate::util::expand_env;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub fn flatten_rel(rel: &Value) -> Vec<String> {
    match rel {
        Value::String(s) if !s.is_empty() => vec![s.clone()],
        Value::Array(a) => a
            .iter()
            .filter_map(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect(),
        Value::Object(o) => o
            .values()
            .filter_map(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect(),
        _ => vec![],
    }
}

fn has_wildcard(s: &str) -> bool {
    s.contains('*') || s.contains('?')
}

fn find_ci_ascii(haystack: &str, needle: &str) -> Option<usize> {
    let hb = haystack.as_bytes();
    let nb = needle.as_bytes();
    if nb.is_empty() || hb.len() < nb.len() {
        return None;
    }
    (0..=hb.len() - nb.len()).find(|&i| hb[i..i + nb.len()].eq_ignore_ascii_case(nb))
}

fn pick_app_from_content_dir(dir: &Path, prefer_base: &str) -> Option<String> {
    if !dir.is_dir() {
        return None;
    }
    if !prefer_base.is_empty() {
        let prefer = dir.join(prefer_base);
        if prefer.is_file() {
            return Some(prefer.to_string_lossy().to_string());
        }
    }
    let mut apps: Vec<String> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if e.path().is_file() {
                if let Some(name) = e.file_name().to_str() {
                    if name.to_lowercase().ends_with(".app") {
                        apps.push(name.to_string());
                    }
                }
            }
        }
    }
    apps.sort();
    apps.last().map(|n| dir.join(n).to_string_lossy().to_string())
}

pub fn resolve_3ds_home(nand_dir: &str, rel: &Value) -> Option<String> {
    if nand_dir.is_empty() {
        return None;
    }
    for cand in flatten_rel(rel) {
        let expanded = expand_env(&cand);
        let norm = expanded.replace('\\', "/");
        let after = match find_ci_ascii(&norm, "/nand/") {
            Some(idx) => norm[idx + 6..].to_string(),
            None => norm.trim_start_matches('/').to_string(),
        };
        let after_path = Path::new(&after);
        let base = after_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let prefer_base = if has_wildcard(&base) {
            String::new()
        } else {
            base.clone()
        };
        let parent = after_path.parent().unwrap_or_else(|| Path::new(""));
        let content_dir = Path::new(nand_dir).join(parent);
        if !prefer_base.is_empty() {
            let direct = content_dir.join(&prefer_base);
            if direct.is_file() {
                return Some(direct.to_string_lossy().to_string());
            }
        }
        if let Some(found) = pick_app_from_content_dir(&content_dir, &prefer_base) {
            return Some(found);
        }
    }
    None
}

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(xml[start..end].to_string())
}

fn cemu_settings_paths(emu_dir: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if !emu_dir.is_empty() {
        out.push(Path::new(emu_dir).join("settings.xml"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        out.push(Path::new(&appdata).join("Cemu").join("settings.xml"));
    }
    out
}

/// Return the first Cemu settings.xml path that actually exists on disk.
pub fn find_cemu_settings_path(emu_dir: &str) -> Option<PathBuf> {
    cemu_settings_paths(emu_dir).into_iter().find(|p| p.is_file())
}

pub fn resolve_wiiu_mlc(emu_dir: &str) -> Option<String> {
    for p in cemu_settings_paths(emu_dir) {
        if p.is_file() {
            if let Ok(xml) = std::fs::read_to_string(&p) {
                if let Some(mlc) = extract_tag(&xml, "mlc_path") {
                    let mlc = mlc.trim();
                    if !mlc.is_empty() {
                        return Some(mlc.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Write (or insert) the <mlc_path> tag in the given settings.xml file.
pub fn write_wiiu_mlc(settings_path: &Path, new_mlc: &str) -> Result<(), String> {
    let xml = std::fs::read_to_string(settings_path).map_err(|e| e.to_string())?;
    let open = "<mlc_path>";
    let close = "</mlc_path>";
    let new_xml = if let (Some(start), Some(rel_end)) = (xml.find(open), xml.find(close)) {
        let end = rel_end + close.len();
        let _ = start; // already captured
        format!("{}{}{}{}", &xml[..start + open.len()], new_mlc, close, &xml[end..])
    } else {
        // Tag not present – insert before </content>
        let anchor = "</content>";
        match xml.find(anchor) {
            Some(pos) => format!(
                "{}\n\t<mlc_path>{}</mlc_path>\n{}",
                &xml[..pos], new_mlc, &xml[pos..]
            ),
            None => return Err("settings.xml: <mlc_path> tag not found and <content> anchor missing".into()),
        }
    };
    std::fs::write(settings_path, new_xml).map_err(|e| e.to_string())
}

pub fn resolve_wiiu_home(emu_dir: &str, rel: &Value) -> Option<String> {
    let mlc = resolve_wiiu_mlc(emu_dir)?;
    for rel_path in flatten_rel(rel) {
        let men = Path::new(&mlc).join(&rel_path);
        if men.is_file() {
            return Some(men.to_string_lossy().to_string());
        }
    }
    None
}

/// Human-friendly label for a Wii U Home Menu region key.
fn wiiu_region_label(key: &str) -> &'static str {
    match key {
        "JP" => "Japan",
        "US" => "USA",
        "EU" => "Europe",
        _ => "Unknown region",
    }
}

/// Extract the 16-hex title ID from a `sys/title/<hi>/<lo>/code/men.rpx` path.
fn title_id_from_rel(rel_path: &str) -> Option<String> {
    let norm = rel_path.replace('\\', "/");
    let comps: Vec<&str> = norm.split('/').filter(|s| !s.is_empty()).collect();
    let idx = comps.iter().position(|c| c.eq_ignore_ascii_case("title"))?;
    let hi = comps.get(idx + 1)?;
    let lo = comps.get(idx + 2)?;
    Some(format!("{hi}{lo}").to_uppercase())
}

/// Locate the Wii U Home Menu (men.rpx) and report which region/title it is.
/// Returns `(region_key, region_label, title_id, path)`.
pub fn resolve_wiiu_home_detailed(
    emu_dir: &str,
    rel: &Value,
) -> Option<(String, String, String, String)> {
    let mlc = resolve_wiiu_mlc(emu_dir)?;
    // Only an object preserves the region keys; serde_json keeps insertion
    // order (JP, US, EU) thanks to the preserve_order feature.
    if let Value::Object(map) = rel {
        for (region, val) in map {
            if let Some(rel_path) = val.as_str() {
                let men = Path::new(&mlc).join(rel_path);
                if men.is_file() {
                    return Some((
                        region.clone(),
                        wiiu_region_label(region).to_string(),
                        title_id_from_rel(rel_path).unwrap_or_default(),
                        men.to_string_lossy().to_string(),
                    ));
                }
            }
        }
    }
    None
}

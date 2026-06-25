use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    pub filters: Option<Vec<Filter>>,
}

#[tauri::command]
pub async fn open_dir(app: AppHandle, options: OpenOptions) -> Value {
    let mut builder = app.dialog().file();
    if let Some(t) = options.title.as_deref() {
        builder = builder.set_title(t);
    } else {
        builder = builder.set_title("Select Folder");
    }
    if let Some(d) = options.default_path.as_deref() {
        if !d.is_empty() {
            builder = builder.set_directory(PathBuf::from(d));
        }
    }
    match builder.blocking_pick_folder() {
        Some(fp) => {
            let p = fp
                .into_path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            json!({ "ok": true, "path": p })
        }
        None => json!({ "ok": false }),
    }
}

#[tauri::command]
pub async fn open_file(app: AppHandle, options: OpenOptions) -> Value {
    let mut builder = app.dialog().file();
    if let Some(t) = options.title.as_deref() {
        builder = builder.set_title(t);
    } else {
        builder = builder.set_title("Select File");
    }
    if let Some(d) = options.default_path.as_deref() {
        if !d.is_empty() {
            builder = builder.set_directory(PathBuf::from(d));
        }
    }
    if let Some(filters) = &options.filters {
        for f in filters {
            let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
            builder = builder.add_filter(&f.name, &exts);
        }
    } else {
        builder = builder.add_filter("Binary/All", &["bin"]);
    }
    match builder.blocking_pick_file() {
        Some(fp) => {
            let p = fp
                .into_path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            json!({ "ok": true, "path": p })
        }
        None => json!({ "ok": false }),
    }
}

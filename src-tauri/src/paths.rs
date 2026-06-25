use crate::util::expand_env;
use std::path::Path;

#[tauri::command]
pub fn expand_path(input: String) -> String {
    if input.is_empty() {
        return String::new();
    }
    expand_env(&input)
}

#[tauri::command]
pub fn path_exists(target_path: String, kind: String) -> bool {
    match std::fs::metadata(Path::new(&target_path)) {
        Ok(md) => match kind.as_str() {
            "file" => md.is_file(),
            "dir" => md.is_dir(),
            _ => true,
        },
        Err(_) => false,
    }
}

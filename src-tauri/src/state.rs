use crate::discord::DiscordManager;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct NandCycle {
    pub list_key: String,
    pub idx: i64,
}

pub struct DownloadState {
    pub downloading: AtomicBool,
    pub cancel: AtomicBool,
    pub tmp: Mutex<Option<PathBuf>>,
    pub staging: Mutex<Option<PathBuf>>,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            downloading: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            tmp: Mutex::new(None),
            staging: Mutex::new(None),
        }
    }
}

pub struct AppState {
    pub nand_cycle: Mutex<NandCycle>,
    pub switch_cycle: Mutex<NandCycle>,
    pub download: Arc<DownloadState>,
    pub discord: Arc<Mutex<DiscordManager>>,
    pub launch_gen: Arc<AtomicU64>,
}

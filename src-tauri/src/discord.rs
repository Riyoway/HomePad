use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

const CLIENT_ID: &str = "1408294974369304607";
const APP_NAME: &str = "HomePad";
const APP_IMAGE: &str = "homepad";
const RELEASES_URL: &str = "https://github.com/Riyoway/HomePad/releases";

pub fn large_image_key(system: &str) -> &'static str {
    match system {
        "Nintendo DS" => "ds",
        "Nintendo DSi" => "dsi",
        "Nintendo 3DS" => "3ds",
        "Nintendo Wii" => "wii",
        "Nintendo Wii U" => "wiiu",
        "Nintendo Switch" => "switch",
        _ => APP_IMAGE,
    }
}

/// The presence currently shown to Discord. Used to skip redundant IPC
/// writes when nothing has actually changed.
#[derive(Clone, PartialEq)]
struct Presence {
    details: String,
    state: String,
    large_key: String,
    large_text: String,
}

pub struct DiscordManager {
    client: Option<DiscordIpcClient>,
    pub connected: bool,
    pub error: bool,
    pub enabled: bool,
    /// Last presence successfully sent; `None` while disconnected.
    current: Option<Presence>,
    /// Start of the elapsed-time counter for the current logical state.
    since: i64,
}

impl DiscordManager {
    pub fn new(enabled: bool) -> Self {
        Self {
            client: None,
            connected: false,
            error: false,
            enabled,
            current: None,
            since: 0,
        }
    }

    pub fn init(&mut self) -> bool {
        if !self.enabled {
            return false;
        }
        let mut client = match DiscordIpcClient::new(CLIENT_ID) {
            Ok(c) => c,
            Err(_) => {
                self.error = true;
                self.connected = false;
                return false;
            }
        };
        if client.connect().is_err() {
            self.error = true;
            self.connected = false;
            self.client = None;
            return false;
        }
        self.client = Some(client);
        self.connected = true;
        self.error = false;
        // Fresh connection: forget any stale presence so the first update
        // below is always sent.
        self.current = None;
        self.set_idle();
        true
    }

    fn now_ts() -> i64 {
        chrono::Utc::now().timestamp()
    }

    fn apply(&mut self, details: &str, state: &str, large_key: &str, large_text: &str) {
        if self.client.is_none() {
            return;
        }
        let next = Presence {
            details: details.to_string(),
            state: state.to_string(),
            large_key: large_key.to_string(),
            large_text: large_text.to_string(),
        };
        // Nothing changed — don't spend an IPC write (and Discord rate-limit
        // budget) re-sending an identical presence.
        if self.current.as_ref() == Some(&next) {
            return;
        }
        // Entering a new logical state restarts the elapsed-time counter.
        self.since = Self::now_ts();
        if self.push(&next) {
            self.current = Some(next);
        } else {
            self.current = None;
        }
    }

    fn push(&mut self, p: &Presence) -> bool {
        // Try once; if the pipe is broken (Discord was closed/restarted),
        // reconnect a single time and retry so the presence self-heals.
        for attempt in 0..2 {
            let Some(client) = self.client.as_mut() else {
                break;
            };
            let mut assets = activity::Assets::new()
                .large_image(&p.large_key)
                .large_text(&p.large_text);
            // Overlay the HomePad badge while a console-specific image is shown.
            if p.large_key != APP_IMAGE {
                assets = assets.small_image(APP_IMAGE).small_text(APP_NAME);
            }
            let act = activity::Activity::new()
                .details(&p.details)
                .state(&p.state)
                .assets(assets)
                .timestamps(activity::Timestamps::new().start(self.since))
                .buttons(vec![activity::Button::new("Get HomePad", RELEASES_URL)]);
            if client.set_activity(act).is_ok() {
                self.connected = true;
                self.error = false;
                return true;
            }
            if attempt == 0 && client.reconnect().is_ok() {
                continue;
            }
            break;
        }
        self.error = true;
        self.connected = false;
        false
    }

    pub fn set_idle(&mut self) {
        self.apply("Browsing systems", "Idle", APP_IMAGE, APP_NAME);
    }

    pub fn set_playing(&mut self, system: &str) {
        let key = large_image_key(system);
        self.apply("Playing", system, key, system);
    }

    pub fn shutdown(&mut self) {
        if let Some(client) = self.client.as_mut() {
            let _ = client.close();
        }
        self.client = None;
        self.connected = false;
        self.current = None;
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }
}

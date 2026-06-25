use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

const CLIENT_ID: &str = "1408294974369304607";

pub fn large_image_key(system: &str) -> &'static str {
    match system {
        "Nintendo DS" => "ds",
        "Nintendo DSi" => "dsi",
        "Nintendo 3DS" => "3ds",
        "Nintendo Wii" => "wii",
        "Nintendo Wii U" => "wiiu",
        "Nintendo Switch" => "switch",
        _ => "lovemu",
    }
}

pub struct DiscordManager {
    client: Option<DiscordIpcClient>,
    pub connected: bool,
    pub error: bool,
    pub enabled: bool,
}

impl DiscordManager {
    pub fn new(enabled: bool) -> Self {
        Self {
            client: None,
            connected: false,
            error: false,
            enabled,
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
        self.set_idle();
        true
    }

    fn now_ts() -> i64 {
        chrono::Utc::now().timestamp()
    }

    fn apply(&mut self, details: &str, state: &str, large_key: &str, large_text: &str) {
        let Some(client) = self.client.as_mut() else {
            return;
        };
        let assets = activity::Assets::new()
            .large_image(large_key)
            .large_text(large_text);
        let timestamps = activity::Timestamps::new().start(Self::now_ts());
        let act = activity::Activity::new()
            .details(details)
            .state(state)
            .assets(assets)
            .timestamps(timestamps);
        if client.set_activity(act).is_err() {
            self.error = true;
            self.connected = false;
        }
    }

    pub fn set_idle(&mut self) {
        self.apply("Browsing systems", "Idle", "lovemu", "Lovemu");
    }

    pub fn set_launching(&mut self, system: &str) {
        let key = large_image_key(system);
        self.apply("Launching", system, key, system);
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
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }
}

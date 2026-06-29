use serde_json::Value;
use std::sync::OnceLock;

const SYSTEMS_JSON: &str = r##"
{
  "Nintendo DS": {
    "emulators": [
      {
        "id": "melonds",
        "name": "melonDS",
        "exe": "melonDS.exe",
        "args": { "emulator": [], "systemMenu": ["-b", "always"], "fullscreen": "-f" },
        "source": { "github": { "owner": "melonDS-emu", "repo": "melonDS", "match": "windows-x86_64", "archive": "zip" } }
      }
    ]
  },
  "Nintendo DSi": {
    "emulators": [
      {
        "id": "melonds",
        "name": "melonDS",
        "exe": "melonDS.exe",
        "args": { "emulator": [], "systemMenu": ["-b", "always"], "fullscreen": "-f" },
        "source": { "github": { "owner": "melonDS-emu", "repo": "melonDS", "match": "windows-x86_64", "archive": "zip" } }
      }
    ]
  },
  "Nintendo 3DS": {
    "emulators": [
      {
        "id": "borked3ds",
        "name": "Borked3DS",
        "exe": "borked3ds.exe",
        "args": { "emulator": [], "systemMenu": ["${homeMenu}"], "fullscreen": "-f" },
        "source": { "github": { "owner": "Borked3DS", "repo": "Borked3DS", "match": "windows-msvc", "archive": "zip" } }
      },
      {
        "id": "azahar",
        "name": "Azahar",
        "exe": "azahar.exe",
        "args": { "emulator": [], "systemMenu": ["${homeMenu}"], "fullscreen": "-f" },
        "source": { "github": { "owner": "azahar-emu", "repo": "azahar", "match": "windows-msvc", "archive": "zip" } }
      },
      {
        "id": "mandarine",
        "name": "Mandarine",
        "exe": "mandarine-qt.exe",
        "args": { "emulator": [], "systemMenu": ["${homeMenu}"], "fullscreen": "-f" },
        "source": { "github": { "owner": "ptyfyre", "repo": "mandarine-neo", "match": "windows-msvc", "archive": "zip" } }
      },
      {
        "id": "citra",
        "name": "Citra",
        "exe": "citra-qt.exe",
        "args": { "emulator": [], "systemMenu": ["${homeMenu}"], "fullscreen": "-f" }
      }
    ],
    "homeMenu": {
      "JP": "00000000000000000000000000000000/title/00040030/00008202/content/*.app",
      "US": "00000000000000000000000000000000/title/00040030/00008f02/content/*.app",
      "EU": "00000000000000000000000000000000/title/00040030/00009802/content/*.app",
      "AU": "00000000000000000000000000000000/title/00040030/00009802/content/*.app",
      "KR": "00000000000000000000000000000000/title/00040030/0000a902/content/*.app",
      "CN": "00000000000000000000000000000000/title/00040030/0000a102/content/*.app",
      "TW": "00000000000000000000000000000000/title/0004001b/00018002/content/*.app"
    }
  },
  "Nintendo Wii": {
    "emulators": [
      {
        "id": "dolphin",
        "name": "Dolphin",
        "exe": "dolphin.exe",
        "args": { "emulator": [], "systemMenu": ["-b", "--nand_title=0000000100000002"], "fullscreen": "" },
        "source": { "url": "https://dl.dolphin-emu.org/releases/2606/dolphin-2606-x64.7z", "archive": "7z" }
      }
    ]
  },
  "Nintendo Wii U": {
    "emulators": [
      {
        "id": "cemu",
        "name": "Cemu",
        "exe": "Cemu.exe",
        "args": { "emulator": [], "systemMenu": ["-g", "${homeMenu}"], "fullscreen": "" },
        "source": { "github": { "owner": "cemu-project", "repo": "Cemu", "match": "windows-x64", "archive": "zip" } }
      }
    ],
    "homeMenu": {
      "JP": "sys/title/00050010/10040000/code/men.rpx",
      "US": "sys/title/00050010/10040100/code/men.rpx",
      "EU": "sys/title/00050010/10040200/code/men.rpx"
    }
  },
  "Nintendo Switch": {
    "emulators": [
      {
        "id": "eden",
        "name": "Eden",
        "exe": "eden.exe",
        "args": { "emulator": [], "systemMenu": ["-qlaunch"], "fullscreen": "-f" },
        "source": { "gitea": { "host": "git.eden-emu.dev", "owner": "eden-emu", "repo": "eden", "match": "amd64-msvc", "archive": "zip", "assetHost": "stable.eden-emu.dev" } }
      },
      {
        "id": "citron",
        "name": "Citron-Neo",
        "exe": "citron.exe",
        "args": { "emulator": [], "systemMenu": ["-g", "${qlaunch}"], "fullscreen": "-f" },
        "source": { "github": { "owner": "citron-neo", "repo": "emulator", "match": "x64-msvc", "archive": "zip" } }
      },
      {
        "id": "sudachi",
        "name": "Sudachi",
        "exe": "sudachi.exe",
        "args": { "emulator": [], "systemMenu": ["-qlaunch"], "fullscreen": "-f" }
      },
      {
        "id": "suyu",
        "name": "Suyu",
        "exe": "suyu.exe",
        "args": { "emulator": [], "systemMenu": ["-ql"], "fullscreen": "-f" },
        "source": { "url": "https://git.suyu.dev/suyu/suyu/releases/download/v0.0.3/Suyu-Windows_x86_64.tar.xz", "archive": "tar.xz" }
      },
      {
        "id": "torzu",
        "name": "Torzu",
        "exe": "torzu.exe",
        "args": { "emulator": [], "systemMenu": ["-qlaunch"], "fullscreen": "-f" }
      }
    ],
    "icon": [ "/assets/Switch.png" ]
  }
}
"##;

pub fn systems() -> &'static Value {
    static CACHE: OnceLock<Value> = OnceLock::new();
    CACHE.get_or_init(|| serde_json::from_str(SYSTEMS_JSON).expect("systems.json is valid"))
}

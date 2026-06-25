# Lovemu

Lovemu is an emulator **home‑system launcher** — a frameless, console‑style dashboard for
launching Nintendo emulators (DS, DSi, 3DS, Wii, Wii U, Switch), downloading them, managing
controllers, and showing live system status.

This is a ground‑up rebuild of the original Electron app (`../Lovemu-old`) on **Tauri v2**, with a
Rust backend and a Vanilla TypeScript + Vite frontend. The UI is a faithful reproduction of the
original; the internals are reorganized into small, single‑responsibility modules.

## Stack

- **Backend:** Rust + Tauri v2 (`src-tauri/`)
- **Frontend:** Vanilla TypeScript + Vite (`src/`, `index.html`)
- **Plugins:** `tauri-plugin-dialog` (file/folder pickers), `tauri-plugin-opener` (open URLs/paths),
  `tauri-plugin-single-instance`
- **Platform:** Windows‑focused (emulator launch via `cmd /C start`, CoreAudio volume, `netsh` Wi‑Fi,
  Cemu `settings.xml` parsing). Other platforms build but stub the native status readers.

## Develop / build

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # produce a release bundle/installer
npm run build          # frontend only (tsc + vite build)
cargo test --lib       # run backend unit tests (from src-tauri/)
```

## Architecture

### Frontend (`src/`)

| File | Responsibility |
|------|----------------|
| `main.ts` | Bootstrap: theme, footer buttons, render tiles, wire subsystems |
| `api.ts` | Typed binding layer over Tauri `invoke`/`listen` (replaces the old `window.api` preload) |
| `types.ts` | Shared types (Settings, SystemsConfig, event payloads) |
| `ui/data.ts` | Renders the console tile carousel from the config |
| `ui/scroller.ts` | Carousel: wheel/drag/inertia, nav arrows, edge fades, keyboard nav |
| `ui/launcher.ts` | Tile click → launch, right‑click context menu, loading overlay, error dialog, app popups |
| `ui/settings.ts` | Settings modal (Audio / General / Emulator / Display) + melonDS config |
| `ui/downloader.ts` | Emulator downloader modal (per‑system, progress, cancel) |
| `ui/controllers.ts` | Controllers modal: gamepad detection, feature chips, 3D cube sim, vibration test |
| `ui/help.ts` | Help modal |
| `ui/status.ts` | Live status bar (battery / Wi‑Fi / volume / clock) subscriptions |
| `ui/dom.ts` | DOM helpers + accessible custom dropdown |
| `ui/toast.ts` / `ui/sounds.ts` | Toast notifications / click‑error‑complete sounds |
| `styles/` | `index.css` (bundled) + swappable `public/themes/{dark,light}.css` |

### Backend (`src-tauri/src/`)

| File | Responsibility |
|------|----------------|
| `lib.rs` | App setup: plugins, managed state, command registration, tray, Discord init, status poller |
| `commands.rs` | `get_config`, `get_settings`, `save_settings`, `quit_app`, `open_external`, Discord controls |
| `launcher.rs` | Build & run the launch command, Home‑menu resolution, after‑launch behavior, process monitor |
| `downloader.rs` | Resolve GitHub release / direct URL, download with progress + cancel, extract (zip/7z/tar.xz) |
| `melonds.rs` | melonDS `melonDS.toml` ensure / read / write / validate |
| `homemenu.rs` | 3DS NAND `.app` and Wii U `men.rpx` resolution |
| `validate.rs` | 3DS NAND suggest/validate, Wii U Home validate, MLC path |
| `sysstatus.rs` | Battery / Wi‑Fi / volume / clock polling → `sys-status` / `power-state` events |
| `discord.rs` | Discord Rich Presence (idle / launching / playing) |
| `tray.rs` | System tray (Show / Quit, click‑to‑restore) |
| `settings.rs`, `paths.rs`, `dialogs.rs`, `util.rs`, `state.rs`, `systems.rs` | Settings store, path helpers, native dialogs, env expansion, shared state, system config |

### IPC contract

The frontend talks to the backend only through `src/api.ts`. Commands use camelCase args on the JS
side (auto‑mapped to snake_case in Rust). Events emitted by Rust and consumed by the frontend:
`download-status`, `download-log`, `sys-status`, `power-state`, `app-popup`.

## Emulator catalog (`src-tauri/src/systems.rs`)

All emulator metadata lives in one place. Each system has a uniform `emulators[]`
list; every entry is a single self-contained unit describing **both** how to launch
the emulator and (optionally) where to download it:

```jsonc
"Nintendo 3DS": {
  "emulators": [
    { "id": "azahar", "name": "Azahar", "exe": "azahar.exe",
      "args": { "emulator": [], "systemMenu": ["${homeMenu}"], "fullscreen": "-f" },
      "source": { "github": { "owner": "azahar-emu", "repo": "azahar",
                              "match": "windows-msvc", "archive": "zip" } } }
  ],
  "homeMenu": { "US": ".../content/*.app", ... },
  "icon": ["/assets/3DS.png"]
}
```

- `args.emulator` / `args.systemMenu` — argv arrays for normal vs Home-menu launch
  (`systemMenu: []` = Home unsupported → falls back to a normal launch).
- `args.fullscreen` — flag injected on a Home launch when `fullscreenHome` is on.
- `${homeMenu}` — replaced with the resolved Home-menu file (3DS NAND `.app`, Wii U `men.rpx`).
- `source.github` `{ owner, repo, match, archive }` — newest release asset matched by `match`+`archive`;
  or `source.url` `{ url, archive }` for a direct link. **No `source` = launch-only** (hidden in the downloader).
- The launcher spawns `exe` + the resolved argv **directly** (no shell, no string parsing).
- Download host allowlisting is derived automatically from these `source` URLs.

To add or update an emulator, edit this one file — no other code changes needed.

## Disclaimer

Lovemu is an independent launcher and is not affiliated with or endorsed by Nintendo or any other
company. Use emulators and BIOS/keys only where you have the legal right to do so. No copyrighted
content is included or distributed by this application.

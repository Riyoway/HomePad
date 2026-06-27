# HomePad

A console-style launcher for Nintendo emulators. HomePad is a frameless, controller-friendly
dashboard that lets you launch, download, and manage emulators for the DS, DSi, 3DS, Wii, Wii U,
and Switch from one place.

## Features

- **Home dashboard** — a clean tile grid for each console, with launch on click.
- **Launch modes** — start the emulator directly, or boot straight into the console's Home Menu.
- **Built-in downloader** — fetch the latest emulator releases per system, with progress and cancel.
- **Settings** — audio, theme (dark/light), per-system emulator folders, melonDS BIOS/firmware, and more.
- **Controllers** — detect connected gamepads with a player indicator and a vibration test.
- **Live status bar** — battery, Wi‑Fi, volume, and clock.
- **Discord Rich Presence** and **system tray** support.

## Supported systems

| System | Emulators |
|--------|-----------|
| Nintendo DS / DSi | melonDS |
| Nintendo 3DS | Borked3DS, Azahar |
| Nintendo Wii | Dolphin |
| Nintendo Wii U | Cemu |
| Nintendo Switch | Eden, Citron, Sudachi, Suyu |

## Getting started

**Prerequisites:** [Node.js](https://nodejs.org), [Rust](https://www.rust-lang.org/tools/install),
and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Windows is the primary
target.

```bash
npm install
npm run tauri dev      # run in development
npm run tauri build    # build a release installer
```

## Built with

[Tauri 2](https://tauri.app) (Rust) + TypeScript and [Vite](https://vite.dev).

## Disclaimer

HomePad is an independent launcher and is not affiliated with or endorsed by Nintendo or any other
company. It does not include or distribute any emulators, games, BIOS, or keys — use them only where
you have the legal right to do so. All trademarks belong to their respective owners.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Settings,
  SystemsConfig,
  OpResult,
  DialogResult,
  DownloadStatus,
  DownloadLog,
  SysStatus,
  PowerState,
  AppPopup,
  DiscordStatus,
  MelonReadResult,
  OpenDialogOptions,
} from "./types";

function on<T>(event: string, cb: (payload: T) => void): () => void {
  let un: UnlistenFn | null = null;
  let cancelled = false;
  listen<T>(event, (e) => cb(e.payload)).then((u) => {
    if (cancelled) u();
    else un = u;
  });
  return () => {
    cancelled = true;
    if (un) {
      un();
      un = null;
    }
  };
}

export const api = {
  getConfig: () => invoke<SystemsConfig>("get_config"),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<OpResult>("save_settings", { settings }),

  expandPath: (input: string) => invoke<string>("expand_path", { input }),
  pathExists: (targetPath: string, kind: "file" | "dir" | "any" = "any") =>
    invoke<boolean>("path_exists", { targetPath, kind }),

  suggest3dsNand: () => invoke<string>("suggest_3ds_nand"),
  validate3dsNand: (nandDir: string) => invoke<OpResult>("validate_3ds_nand", { nandDir }),
  threeDsHomeStatus: (nandDir?: string) =>
    invoke<{
      found: boolean;
      region?: string;
      regionLabel?: string;
      titleId?: string;
      path?: string;
    }>("three_ds_home_status", { nandDir: nandDir ?? null }),
  validateWiiUHome: (emuDir: string) => invoke<OpResult>("validate_wiiu_home", { emuDir }),
  suggestSwitchDataDir: () => invoke<string>("suggest_switch_data_dir"),
  switchInstallStatus: (dataDir?: string) =>
    invoke<{
      dataDir: string;
      valid: boolean;
      keysDir?: string;
      firmwareDir?: string;
      prodKeys?: boolean;
      titleKeys?: boolean;
      firmwareCount?: number;
      homeMenu?: boolean;
    }>("switch_install_status", { dataDir: dataDir ?? null }),
  installSwitchKeys: (dataDir: string, source: string) =>
    invoke<OpResult & { installed?: string[] }>("install_switch_keys", { dataDir, source }),
  installSwitchFirmware: (dataDir: string, source: string) =>
    invoke<OpResult & { installed?: number }>("install_switch_firmware", { dataDir, source }),

  suggest3dsDataDir: () => invoke<string>("suggest_3ds_data_dir"),
  threeDsInstallStatus: (dataDir?: string) =>
    invoke<{
      dataDir: string;
      valid: boolean;
      sysdataDir?: string;
      aesKeys?: boolean;
      seeddb?: boolean;
      sharedFont?: boolean;
    }>("three_ds_install_status", { dataDir: dataDir ?? null }),
  install3dsKeys: (dataDir: string, source: string) =>
    invoke<OpResult & { installed?: string[] }>("install_3ds_keys", { dataDir, source }),

  getWiiUMlcPath: () => invoke<string>("get_wiiu_mlc_path"),
  getWiiUMlcInfo: (emuDir?: string) =>
    invoke<{ xmlPath: string; mlcPath: string }>("get_wiiu_mlc_info", { emuDir: emuDir ?? null }),
  wiiuHomeStatus: (emuDir?: string) =>
    invoke<{
      found: boolean;
      region?: string;
      regionLabel?: string;
      titleId?: string;
      path?: string;
    }>("wiiu_home_status", { emuDir: emuDir ?? null }),
  setWiiUMlcPath: (mlcPath: string) => invoke<OpResult>("set_wiiu_mlc_path", { mlcPath }),

  downloadSystem: (system: string, key?: string) =>
    invoke<OpResult>("download_system", { system, key: key ?? null }),
  cancelDownload: () => invoke<OpResult>("cancel_download"),

  openDir: (options: OpenDialogOptions = {}) => invoke<DialogResult>("open_dir", { options }),
  openFile: (options: OpenDialogOptions = {}) => invoke<DialogResult>("open_file", { options }),

  quit: () => invoke("quit_app"),
  setFullscreen: (on: boolean) => invoke<boolean>("set_fullscreen", { on }),
  getFullscreen: () => invoke<boolean>("get_fullscreen"),
  launch: (systemName: string) => invoke<OpResult>("launch", { systemName }),
  launchAction: (systemName: string, action: string) =>
    invoke<OpResult>("launch_action", { systemName, action }),
  openExternal: (url: string) => invoke<OpResult>("open_external", { url }),
  checkUpdate: () =>
    invoke<{
      ok: boolean;
      error?: string;
      current: string;
      latest?: string;
      name?: string;
      notes?: string;
      url?: string;
      prerelease?: boolean;
      hasUpdate?: boolean;
      noReleases?: boolean;
    }>("check_update"),

  discordRetry: () => invoke<OpResult>("discord_retry"),
  getDiscordStatus: () => invoke<DiscordStatus>("discord_status"),

  melondsEnsureConfig: (emuDir: string) => invoke<OpResult>("melonds_ensure_config", { emuDir }),
  melondsRead: (emuDir: string) => invoke<MelonReadResult>("melonds_read", { emuDir }),
  melondsWrite: (emuDir: string, patch: Record<string, any>) =>
    invoke<OpResult>("melonds_write", { emuDir, patch }),
  melondsValidate: (emuDir: string, systemName: string) =>
    invoke<OpResult>("melonds_validate", { emuDir, systemName }),

  onDownloadLog: (cb: (p: DownloadLog) => void) => on<DownloadLog>("download-log", cb),
  onDownloadStatus: (cb: (p: DownloadStatus) => void) => on<DownloadStatus>("download-status", cb),
  onSysStatus: (cb: (p: SysStatus) => void) => on<SysStatus>("sys-status", cb),
  onPowerState: (cb: (p: PowerState) => void) => on<PowerState>("power-state", cb),
  onAppPopup: (cb: (p: AppPopup) => void) => on<AppPopup>("app-popup", cb),

  getOnlineStatus: () => navigator.onLine,
  onOnlineChange: (cb: () => void) => {
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
  },
};

export type Api = typeof api;

export type Theme = "dark" | "light";
export type EmuMode = "emulator" | "home";
export type AfterLaunch = "nothing" | "minimize" | "exit";

export interface AudioSettings {
  mute?: boolean;
  volume?: number;
}

export interface EmulatorSettings {
  mode?: EmuMode;
  nandDir?: string;
  paths?: Record<string, string>;
  afterLaunch?: AfterLaunch;
  fullscreenHome?: boolean;
}

export interface DisplaySettings {
  theme?: Theme;
  iconColor?: "white" | "black" | "custom";
  iconCustomColor?: Record<string, "white" | "black">;
}

export interface Settings {
  audio?: AudioSettings;
  emulator?: EmulatorSettings;
  display?: DisplaySettings;
  downloader?: { dir?: string };
  discord?: { enabled?: boolean };
}

export interface EmulatorSource {
  github?: { owner: string; repo: string; match: string; archive: string };
  url?: string;
  archive?: string;
}

export interface Emulator {
  id: string;
  name: string;
  exe: string;
  args?: {
    emulator?: string[];
    systemMenu?: string[];
    fullscreen?: string;
  };
  source?: EmulatorSource;
}

export interface SystemConfig {
  emulators?: Emulator[];
  homeMenu?: Record<string, string>;
  icon?: string[];
  [key: string]: unknown;
}

export type SystemsConfig = Record<string, SystemConfig>;

export interface OpResult {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

export interface DialogResult {
  ok: boolean;
  path?: string;
}

export type DownloadPhase =
  | "start"
  | "downloading"
  | "progress"
  | "extracting"
  | "done"
  | "error";

export interface DownloadStatus {
  key?: string | null;
  status: DownloadPhase;
  received?: number;
  total?: number;
  percent?: number;
  url?: string;
  type?: string;
  destDir?: string;
  message?: string;
}

export interface DownloadLog {
  key?: string | null;
  message: string;
}

export interface SysStatus {
  time?: {
    hours: number;
    minutes: number;
    year: number;
    month: number;
    day: number;
  };
  battery?: { percent: number | null; isCharging: boolean };
  wifi?: { quality: number | null; bars: number };
  volume?: { level: number | null; muted: boolean };
}

export interface PowerState {
  onBattery: boolean;
}

export interface AppPopup {
  type: "info" | "success" | "warning" | "error";
  message: string;
  duration?: number;
}

export interface DiscordStatus {
  enabled: boolean;
  connected: boolean;
  error: boolean;
}

export interface MelonReadResult {
  ok: boolean;
  data?: Record<string, any>;
  path?: string;
  error?: string;
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

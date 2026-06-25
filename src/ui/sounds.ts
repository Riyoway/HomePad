import { api } from "../api";

const CLICK_PATH = "/assets/sounds/click.wav";
const ERROR_PATH = "/assets/sounds/error.wav";
const COMPLETE_PATH = "/assets/sounds/complete.wav";

let isMuted = false;
let volume = 1.0;
const clickPool: HTMLAudioElement[] = [];
const errorPool: HTMLAudioElement[] = [];
const completePool: HTMLAudioElement[] = [];
const POOL_SIZE = 6;

async function refreshAudioSettings(): Promise<void> {
  try {
    const s = await api.getSettings();
    isMuted = !!s?.audio?.mute;
    const v = Number(s?.audio?.volume);
    if (Number.isFinite(v)) volume = Math.max(0, Math.min(100, v)) / 100;
    [...clickPool, ...errorPool, ...completePool].forEach((a) => {
      try {
        a.volume = volume;
      } catch {}
    });
  } catch {
  }
}
document.addEventListener("settings:updated", refreshAudioSettings);
refreshAudioSettings();

function makeAudio(src: string): HTMLAudioElement {
  const a = new Audio(src);
  a.preload = "auto";
  a.currentTime = 0;
  try {
    a.volume = volume;
  } catch {}
  try {
    a.load?.();
  } catch {}
  a.addEventListener("error", () => {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
  });
  return a;
}

function getFromPool(pool: HTMLAudioElement[], src: string): HTMLAudioElement | null {
  const idle = pool.find((a) => a.ended || a.paused);
  if (idle) {
    try {
      idle.currentTime = 0;
    } catch {}
    return idle;
  }
  if (pool.length < POOL_SIZE) {
    const a = makeAudio(src);
    pool.push(a);
    return a;
  }
  return null;
}

export async function playClick(): Promise<void> {
  if (isMuted) return;
  try {
    const a = getFromPool(clickPool, CLICK_PATH);
    if (!a) return;
    try {
      a.volume = volume;
    } catch {}
    await a.play();
  } catch {
  }
}

export async function playError(): Promise<void> {
  if (isMuted) return;
  try {
    const a = getFromPool(errorPool, ERROR_PATH);
    if (!a) return;
    try {
      a.volume = volume;
    } catch {}
    await a.play();
  } catch {
  }
}

export async function playComplete(): Promise<void> {
  if (isMuted) return;
  try {
    const a = getFromPool(completePool, COMPLETE_PATH);
    if (!a) return;
    try {
      a.volume = volume;
    } catch {}
    await a.play();
  } catch {
  }
}

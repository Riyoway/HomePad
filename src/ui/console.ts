import { api } from "../api";
import { playClick } from "./sounds";

let consoleMode = false;

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("#apps .app-card"));
}

function currentCard(cs: HTMLElement[]): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (active && cs.includes(active)) return active;
  return cs.find((c) => c.getAttribute("tabindex") === "0") || cs[0] || null;
}

function moveFocus(dir: number): void {
  const cs = cards();
  if (!cs.length) return;
  const cur = currentCard(cs);
  const idx = cur ? cs.indexOf(cur) : 0;
  const next = Math.max(0, Math.min(cs.length - 1, idx + dir));
  cs.forEach((c, i) => c.setAttribute("tabindex", i === next ? "0" : "-1"));
  const target = cs[next];
  target.focus();
  target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

function activateFocused(): void {
  const cur = currentCard(cards());
  if (cur) cur.click();
}

function focusFirst(): void {
  const cs = cards();
  if (!cs.length) return;
  const cur = currentCard(cs) || cs[0];
  cs.forEach((c) => c.setAttribute("tabindex", c === cur ? "0" : "-1"));
  cur.focus();
  cur.scrollIntoView({ inline: "center", block: "nearest" });
}

function anyOverlayOpen(): boolean {
  return !!document.querySelector(".overlay.show");
}

function closeTopOverlay(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

export function isConsoleMode(): boolean {
  return consoleMode;
}

export async function setConsoleMode(on: boolean): Promise<void> {
  consoleMode = on;
  document.body.classList.toggle("console-mode", on);
  try {
    await api.setFullscreen(on);
  } catch {}
  if (on) requestAnimationFrame(() => focusFirst());
}

export async function toggleConsoleMode(): Promise<void> {
  playClick();
  await setConsoleMode(!consoleMode);
}

const DEAD = 0.5;
const FIRST_REPEAT = 360;
const REPEAT = 130;
let lastMove = 0;
let dirHeld = false;
const prev: Record<number, boolean> = {};

function btn(gp: Gamepad, i: number): boolean {
  return !!gp.buttons[i]?.pressed;
}

function handlePad(gp: Gamepad): void {
  const now = performance.now();
  const modal = anyOverlayOpen();

  const axisX = gp.axes[0] ?? 0;
  const left = btn(gp, 14) || axisX < -DEAD;
  const right = btn(gp, 15) || axisX > DEAD;

  if (!modal && (left || right)) {
    if (now - lastMove > (dirHeld ? REPEAT : FIRST_REPEAT)) {
      moveFocus(left ? -1 : 1);
      lastMove = now;
      dirHeld = true;
    }
  } else {
    dirHeld = false;
  }

  const a = btn(gp, 0);
  const b = btn(gp, 1);
  const start = btn(gp, 9);

  if (a && !prev[0] && !modal) activateFocused();
  if (b && !prev[1]) {
    if (modal) closeTopOverlay();
    else if (consoleMode) void setConsoleMode(false);
  }
  if (start && !prev[9]) void toggleConsoleMode();

  prev[0] = a;
  prev[1] = b;
  prev[9] = start;
}

function gamepadLoop(): void {
  const tick = () => {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(list).find((p): p is Gamepad => !!p && p.connected);
    if (gp) handlePad(gp);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function setupConsoleMode(): void {
  document.addEventListener("keydown", (e) => {
    if (e.key === "F11") {
      e.preventDefault();
      void toggleConsoleMode();
    } else if (e.key === "Escape" && consoleMode && !anyOverlayOpen()) {
      e.preventDefault();
      void setConsoleMode(false);
    }
  });
  gamepadLoop();
}

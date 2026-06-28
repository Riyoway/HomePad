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

function getVisibleFocusableElements(): HTMLElement[] {
  const selector = "button, input, select, textarea, a[href], [tabindex]";
  // While a modal overlay is open, trap navigation inside it so directional
  // input can't jump to the tiles/buttons behind the scrim.
  const openOverlay = document.querySelector<HTMLElement>(".overlay.show");
  const root: ParentNode = openOverlay ?? document;
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
  return elements.filter((el) => {
    if ((el as any).disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;

    const tabIndexAttr = el.getAttribute("tabindex");
    if (tabIndexAttr === "-1") {
      const role = el.getAttribute("role");
      const isTabOrOption = role === "tab" || role === "option";
      const isAppCard = el.classList.contains("app-card");
      const isButton = el.tagName === "BUTTON";
      if (!isTabOrOption && !isAppCard && !isButton) {
        return false;
      }
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;

    if (el.closest("[hidden]")) return false;
    const parentOverlay = el.closest(".overlay");
    if (parentOverlay && !parentOverlay.classList.contains("show")) return false;

    return true;
  });
}

function moveSpatialFocus(dir: "up" | "down" | "left" | "right"): void {
  const cur = document.activeElement as HTMLElement | null;
  const list = getVisibleFocusableElements();
  if (!list.length) return;

  if (!cur || !list.includes(cur)) {
    const cardsList = Array.from(document.querySelectorAll<HTMLElement>("#apps .app-card"));
    const rovingCard = cardsList.find((c) => c.getAttribute("tabindex") === "0") || cardsList[0];
    if (rovingCard && list.includes(rovingCard)) {
      rovingCard.focus();
    } else {
      list[0].focus();
    }
    return;
  }

  const curRect = cur.getBoundingClientRect();
  const curCenterX = curRect.left + curRect.width / 2;
  const curCenterY = curRect.top + curRect.height / 2;

  let bestEl: HTMLElement | null = null;
  let minScore = Infinity;

  for (const el of list) {
    if (el === cur) continue;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = centerX - curCenterX;
    const dy = centerY - curCenterY;

    let isCorrectDirection = false;
    switch (dir) {
      case "left":
        isCorrectDirection = dx < -5;
        break;
      case "right":
        isCorrectDirection = dx > 5;
        break;
      case "up":
        isCorrectDirection = dy < -5;
        break;
      case "down":
        isCorrectDirection = dy > 5;
        break;
    }

    if (!isCorrectDirection) continue;

    let score = 0;
    if (dir === "left" || dir === "right") {
      score = Math.abs(dx) + 4 * Math.abs(dy);
    } else {
      score = Math.abs(dy) + 4 * Math.abs(dx);
    }

    if (score < minScore) {
      minScore = score;
      bestEl = el;
    }
  }

  if (bestEl) {
    if (bestEl.classList.contains("app-card")) {
      const cardsList = Array.from(document.querySelectorAll<HTMLElement>("#apps .app-card"));
      cardsList.forEach((c) => c.setAttribute("tabindex", c === bestEl ? "0" : "-1"));
    } else if (bestEl.classList.contains("nav-item") && bestEl.closest(".settings-nav")) {
      const tabsList = Array.from(bestEl.closest(".settings-nav")!.querySelectorAll<HTMLElement>(".nav-item"));
      tabsList.forEach((t) => t.setAttribute("tabindex", t === bestEl ? "0" : "-1"));
    }
    bestEl.focus();
    bestEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
}

function handlePad(gp: Gamepad): void {
  const now = performance.now();
  const modal = anyOverlayOpen();

  const axisX = gp.axes[0] ?? 0;
  const axisY = gp.axes[1] ?? 0;
  const left = btn(gp, 14) || axisX < -DEAD;
  const right = btn(gp, 15) || axisX > DEAD;
  const up = btn(gp, 12) || axisY < -DEAD;
  const down = btn(gp, 13) || axisY > DEAD;

  const a = btn(gp, 0);
  const b = btn(gp, 1);
  const start = btn(gp, 9);

  if (left || right || up || down || a || b || start) {
    document.body.classList.add("gamepad-active");
  }

  if (left || right || up || down) {
    if (now - lastMove > (dirHeld ? REPEAT : FIRST_REPEAT)) {
      let dir: "up" | "down" | "left" | "right" | null = null;
      if (left) dir = "left";
      else if (right) dir = "right";
      else if (up) dir = "up";
      else if (down) dir = "down";

      if (dir) {
        moveSpatialFocus(dir);
      }
      lastMove = now;
      dirHeld = true;
    }
  } else {
    dirHeld = false;
  }

  if (a && !prev[0]) {
    const cur = document.activeElement as HTMLElement | null;
    if (cur) {
      cur.click();
    }
  }
  if (b && !prev[1]) {
    if (modal) {
      closeTopOverlay();
    } else if (consoleMode) {
      void setConsoleMode(false);
    }
  }
  if (start && !prev[9]) {
    void toggleConsoleMode();
  }

  prev[0] = a;
  prev[1] = b;
  prev[9] = start;
}

function resetPadState(): void {
  prev[0] = false;
  prev[1] = false;
  prev[9] = false;
  dirHeld = false;
}

function gamepadLoop(): void {
  const tick = () => {
    // Only act on the controller while HomePad actually has window focus.
    // After launching an emulator the game takes the foreground; without this
    // guard the Gamepad API keeps reporting state and HomePad would react in
    // the background to input meant for the emulator.
    if (!document.hasFocus()) {
      resetPadState();
      requestAnimationFrame(tick);
      return;
    }
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(list).find((p): p is Gamepad => !!p && p.connected);
    if (gp) handlePad(gp);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function setupConsoleMode(): void {
  document.addEventListener("keydown", (e) => {
    document.body.classList.remove("gamepad-active");
    if (e.key === "F11") {
      e.preventDefault();
      void toggleConsoleMode();
    } else if (e.key === "Escape" && consoleMode && !anyOverlayOpen()) {
      e.preventDefault();
      void setConsoleMode(false);
    }
  });

  window.addEventListener("mousedown", () => {
    document.body.classList.remove("gamepad-active");
  });

  gamepadLoop();
}

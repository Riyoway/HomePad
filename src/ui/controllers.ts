import { api } from "../api";

type Pad = Gamepad;

interface ControllersModal extends HTMLDivElement {
  _pressRAF?: number;
}

interface PadSnapshot {
  idx: number;
  id: string;
  map: string;
  b: number;
  a: number;
  vib: boolean;
}

const _ignoredGamepads = new Set<number>();

export function setupGamepadIndicator(): void {
  const indicator = document.getElementById("controller-indicator");
  const badge = document.getElementById("controller-count");
  const headerBadge = document.getElementById("controller-count-header");
  if (!indicator && !headerBadge) return;

  const getPads = (): Pad[] => {
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    return Array.from(list).filter(
      (g): g is Pad => !!g && g.connected && !_ignoredGamepads.has(g.index),
    );
  };

  const update = () => {
    try {
      const pads = getPads();
      const count = pads.length;
      if (badge) badge.textContent = String(count);
      if (indicator) indicator.style.display = count > 0 ? "inline-flex" : "none";
      if (headerBadge) headerBadge.textContent = String(count);
    } catch {
      if (badge) badge.textContent = "0";
      if (indicator) indicator.style.display = "none";
      if (headerBadge) headerBadge.textContent = "0";
    }
  };

  window.addEventListener("gamepadconnected", update, { passive: true });
  window.addEventListener("gamepaddisconnected", update, { passive: true });
  const interval = window.setInterval(update, 1000);
  window.addEventListener("beforeunload", () => clearInterval(interval), { once: true });
  update();
}

const GAMEPAD_SVG = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M189-160q-60 0-102.5-43T42-307q0-9 1-18t3-18l84-336q14-54 57-87.5t98-33.5h390q55 0 98 33.5t57 87.5l84 336q2 9 3.5 18.5T919-306q0 61-43.5 103.5T771-160q-42 0-78-22t-54-60l-28-58q-5-10-15-15t-21-5H385q-11 0-21 5t-15 15l-28 58q-18 38-54 60t-78 22Zm3-80q19 0 34.5-10t23.5-27l28-57q15-31 44-48.5t63-17.5h190q34 0 63 18t45 48l28 57q8 17 23.5 27t34.5 10q28 0 48-18.5t21-46.5q0 1-2-19l-84-335q-7-27-28-44t-49-17H285q-28 0-49.5 17T208-659l-84 335q-2 6-2 18 0 28 20.5 47t49.5 19Zm348-280q17 0 28.5-11.5T580-560q0-17-11.5-28.5T540-600q-17 0-28.5 11.5T500-560q0 17 11.5 28.5T540-520Zm80-80q17 0 28.5-11.5T660-640q0-17-11.5-28.5T620-680q-17 0-28.5 11.5T580-640q0 17 11.5 28.5T620-600Zm0 160q17 0 28.5-11.5T660-480q0-17-11.5-28.5T620-520q-17 0-28.5 11.5T580-480q0 17 11.5 28.5T620-440Zm80-80q17 0 28.5-11.5T740-560q0-17-11.5-28.5T700-600q-17 0-28.5 11.5T660-560q0 17 11.5 28.5T700-520Zm-360 60q13 0 21.5-8.5T370-490v-40h40q13 0 21.5-8.5T440-560q0-13-8.5-21.5T410-590h-40v-40q0-13-8.5-21.5T340-660q-13 0-21.5 8.5T310-630v40h-40q-13 0-21.5 8.5T240-560q0 13 8.5 21.5T270-530h40v40q0 13 8.5 21.5T340-460Zm140-20Z"/></svg>`;

const BLUETOOTH_SVG = `<svg viewBox="0 0 24 24"><path d="M7 7l10 10-5 5V2l5 5-10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CLOSE_SVG = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export function openControllersModal(): void {
  const getPads = (): Pad[] =>
    Array.from((navigator.getGamepads && navigator.getGamepads()) || []).filter(
      (g): g is Pad => !!g && g.connected,
    );
  const pads = getPads();

  const overlay = document.createElement("div");
  overlay.className = "overlay show";
  overlay.setAttribute("role", "dialog");

  const modal = document.createElement("div") as ControllersModal;
  modal.className = "modal modal-enter switch-modal controllers-modal";
  modal.setAttribute("role", "dialog");
  modal.innerHTML = `
    <div class="modal-header">Controllers</div>
    <div class="modal-body">
      ${pads.length === 0 ? '<div class="empty-hint">No controllers connected.</div>' : ""}
      <div class="panels controllers-list">
        ${pads.map((p) => renderPadCard(p)).join("")}
      </div>
    </div>
    <div class="modal-footer hint-bar">
      <button class="hint" id="btn-open-bt" aria-label="Bluetooth">
        <span class="glyph">${BLUETOOTH_SVG}</span><span>Bluetooth</span>
      </button>
      <button class="hint primary" id="btn-close" aria-label="Close">
        <span class="glyph">${CLOSE_SVG}</span><span>Close</span>
      </button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const listEl = (): HTMLElement | null => modal.querySelector(".panels.controllers-list");
  const emptyHintEl = (): HTMLElement | null => modal.querySelector(".empty-hint");

  let prevSnapshot: PadSnapshot[] = [];
  const snapshotOf = (list: Pad[]): PadSnapshot[] =>
    list
      .map((p) => ({
        idx: p.index,
        id: String(p.id || ""),
        map: String(p.mapping || ""),
        b: p.buttons?.length ?? 0,
        a: p.axes?.length ?? 0,
        vib: !!(p as any).vibrationActuator,
      }))
      .sort((x, y) => x.idx - y.idx);

  const sameSnapshot = (a: PadSnapshot[], b: PadSnapshot[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (x.idx !== y.idx || x.id !== y.id || x.map !== y.map || x.b !== y.b || x.a !== y.a || x.vib !== y.vib)
        return false;
    }
    return true;
  };

  const upsertPad = (p: Pad): void => {
    const container = listEl();
    if (!container) return;
    const host = container.querySelector<HTMLElement>(`#pad-${p.index}`);
    if (!host) {
      const tmp = document.createElement("div");
      tmp.innerHTML = renderPadCard(p);
      const card = tmp.firstElementChild as HTMLElement | null;
      if (card) {
        container.appendChild(card);
        bindPadControls(modal, p);
      }
      return;
    }
    const nameEl = host.querySelector(".pad-name");
    const subEl = host.querySelector(".pad-sub");
    const featuresEl = host.querySelector(".features");
    const playerEl = host.querySelector<HTMLElement>(".pad-player");
    const actionsEl = host.querySelector<HTMLElement>(".pad-actions");
    if (nameEl) nameEl.textContent = String(p.id || "Controller");
    if (subEl) subEl.textContent = `Mapping: ${String(p.mapping || "standard")} · Index: ${p.index}`;
    if (featuresEl) {
      const features = detectPadFeatures(p);
      featuresEl.innerHTML = [
        chip("buttons", `${p.buttons?.length ?? 0} Buttons`),
        chip("axes", `${p.axes?.length ?? 0} Axes`),
        ...featuresToChips(features),
      ].join("");
    }
    if (playerEl) playerEl.innerHTML = playerLeds(p.index);
    if (actionsEl && !actionsEl.querySelector(`#pad-vibrate-${p.index}`)) {
      actionsEl.innerHTML = vibeButton(p.index);
      bindPadControls(modal, p);
    }
  };

  const renderList = (): void => {
    const current = getPads();
    const container = listEl();
    if (!container) return;
    const snap = snapshotOf(current);
    if (sameSnapshot(prevSnapshot, snap)) return;
    prevSnapshot = snap;

    const existing = Array.from(container.querySelectorAll<HTMLElement>('[id^="pad-"]'));
    const currentIds = new Set(current.map((p) => `pad-${p.index}`));
    existing.forEach((el) => {
      if (!currentIds.has(el.id)) el.remove();
    });

    current.forEach((p) => upsertPad(p));

    const hint = emptyHintEl();
    if (hint && current.length > 0) hint.remove();
    else if (!hint && current.length === 0) {
      const hintDiv = document.createElement("div");
      hintDiv.className = "empty-hint";
      hintDiv.textContent = "No controllers connected.";
      modal.querySelector(".modal-body")?.insertAdjacentElement("afterbegin", hintDiv);
    }
  };

  const onGamepadChange = () => renderList();
  window.addEventListener("gamepadconnected", onGamepadChange, { passive: true });
  window.addEventListener("gamepaddisconnected", onGamepadChange, { passive: true });
  const pollId = window.setInterval(onGamepadChange, 1500);

  const pressStep = (): void => {
    const gps =
      navigator.getGamepads && navigator.getGamepads() ? navigator.getGamepads() : [];
    const container = listEl();
    if (container) {
      const cards = container.querySelectorAll<HTMLElement>(".pad-card");
      cards.forEach((card) => {
        const idx = Number(card.id.replace("pad-", ""));
        const gp = gps && gps[idx];
        const pressed = !!(gp && gp.buttons && gp.buttons.some((b) => !!b && b.pressed));
        card.classList.toggle("pressed", pressed);
      });
    }
    modal._pressRAF = requestAnimationFrame(pressStep);
  };
  modal._pressRAF = requestAnimationFrame(pressStep);

  let onKeydown: ((e: KeyboardEvent) => void) | null = null;

  const close = (): void => {
    window.removeEventListener("gamepadconnected", onGamepadChange);
    window.removeEventListener("gamepaddisconnected", onGamepadChange);
    clearInterval(pollId);
    if (modal._pressRAF !== undefined) {
      cancelAnimationFrame(modal._pressRAF);
      modal._pressRAF = undefined;
    }
    if (onKeydown) {
      document.removeEventListener("keydown", onKeydown);
      onKeydown = null;
    }
    modal.classList.remove("modal-enter");
    modal.classList.add("modal-exit");
    modal.addEventListener("animationend", () => overlay.remove(), { once: true });
  };

  modal.querySelector("#btn-close")?.addEventListener("click", () => close());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector("#btn-open-bt")?.addEventListener("click", () => {
    void api.openExternal("ms-settings:bluetooth");
  });
  onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown);

  pads.forEach((p) => bindPadControls(modal, p));
}

function playerLeds(index: number): string {
  const lit = Math.min(index + 1, 4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += `<span class="pad-led${i < lit ? " on" : ""}"></span>`;
  }
  return out;
}

function renderPadCard(p: Pad): string {
  const features = detectPadFeatures(p);
  return `
    <div class="pad-card" id="pad-${p.index}">
      <div class="pad-visual">
        <div class="pad-figure">${GAMEPAD_SVG}</div>
        <div class="pad-player" aria-label="Player ${p.index + 1}">${playerLeds(p.index)}</div>
      </div>
      <div class="pad-info">
        <div class="pad-name">${escapeHtml(p.id || "Controller")}</div>
        <div class="pad-sub">Mapping: ${escapeHtml(p.mapping || "standard")} · Index: ${p.index}</div>
        <div class="features">
          ${chip("buttons", `${p.buttons?.length ?? 0} Buttons`)}
          ${chip("axes", `${p.axes?.length ?? 0} Axes`)}
          ${featuresToChips(features).join("")}
        </div>
      </div>
      <div class="pad-actions">
        ${vibeButton(p.index)}
      </div>
    </div>
  `;
}

function detectPadFeatures(p: Pad): string[] {
  const feats: string[] = [];
  if ((p as any).vibrationActuator) feats.push("Vibration");
  const id = String(p.id || "").toLowerCase();
  const isDualSense = id.includes("dualsense");
  const isSwitch = id.includes("switch");
  const wirelessHint = /(bluetooth|wireless|2\.4|2\.4g|rf|dongle|receiver|nano)/.test(id);
  const wiredNegation = /(\bwired\b|\busb\b|cable)/.test(id);
  if (wirelessHint && !wiredNegation) feats.push("Wireless");
  if (isDualSense || isSwitch) feats.push("Gyro (likely)");
  return feats;
}

function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"]+/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );
}

function chip(type: string, label: string, tone = "ok"): string {
  const icon = chipIcon(type);
  const toneClass = type === "ignored" ? "warn" : tone || "ok";
  return `<span class="feature-chip ${toneClass}" title="${escapeHtml(label)}">${icon}<span>${escapeHtml(label)}</span></span>`;
}

function chipIcon(type: string): string {
  switch (type) {
    case "buttons":
      return '<svg class="icon" viewBox="0 -960 960 960" aria-hidden="true"><path d="M864-40 741-162q-18 11-38.5 16.5T660-140q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 23-6 43.5T797-218L920-96l-56 56ZM220-140q-66 0-113-47T60-300q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T300-300q0-33-23.5-56.5T220-380q-33 0-56.5 23.5T140-300q0 33 23.5 56.5T220-220Zm440 0q33 0 56.5-23.5T740-300q0-33-23.5-56.5T660-380q-33 0-56.5 23.5T580-300q0 33 23.5 56.5T660-220ZM220-580q-66 0-113-47T60-740q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm440 0q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm-440-80q33 0 56.5-23.5T300-740q0-33-23.5-56.5T220-820q-33 0-56.5 23.5T140-740q0 33 23.5 56.5T220-660Zm440 0q33 0 56.5-23.5T740-740q0-33-23.5-56.5T660-820q-33 0-56.5 23.5T580-740q0 33 23.5 56.5T660-660ZM220-300Zm0-440Zm440 0Z" fill="currentColor"/></svg>';
    case "axes":
      return '<svg class="icon" viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-654Zm174 174Zm-348 0Zm174 174Zm0-234L360-660v-220h240v220L480-540Zm180 180L540-480l120-120h220v240H660Zm-580 0v-240h220l120 120-120 120H80ZM360-80v-220l120-120 120 120v220H360Zm120-574 40-40v-106h-80v106l40 40ZM160-440h106l40-40-40-40H160v80Zm280 280h80v-106l-40-40-40 40v106Zm254-280h106v-80H694l-40 40 40 40Z" fill="currentColor"/></svg>';
    case "mapping":
      return '<svg viewBox="0 0 24 24" class="icon"><path d="M4 7h16M4 12h10M4 17h7" stroke-width="2"/></svg>';
    case "Vibration":
      return '<svg class="icon" viewBox="0 -960 960 960" aria-hidden="true"><path d="M750-614q-27 27-62 41t-70 14q-35 0-69-13.5T488-614l-75-75q-15-15-34-22.5t-39-7.5q-20 0-39 7.5T267-689l-75 75-57-57 75-75q27-27 61-40.5t69-13.5q35 0 68.5 13.5T469-746l75 75q16 16 35 23.5t39 7.5q20 0 39.5-7.5T693-671l75-75 57 57-75 75Zm0 200q-27 27-61.5 40.5T619-360q-35 0-69.5-13.5T488-414l-75-75q-15-15-34-22.5t-39-7.5q-20 0-39 7.5T267-489l-75 75-57-56 75-76q27-27 61-40.5t69-13.5q35 0 68.5 13.5T469-546l75 75q16 16 35 23.5t39 7.5q20 0 39.5-7.5T693-471l75-75 57 57-75 75Zm-1 200q-27 27-61 40.5T619-160q-35 0-69.5-13.5T488-214l-76-75q-15-15-34-22.5t-39-7.5q-20 0-39 7.5T266-289l-75 75-56-56 75-76q27-27 61-40.5t69-13.5q35 0 68.5 13.5T469-346l75 75q16 16 35.5 23.5T619-240q20 0 39-7.5t35-23.5l75-75 56 57-75 75Z" fill="currentColor"/></svg>';
    case "Wireless":
      return '<svg class="icon" viewBox="0 -960 960 960" aria-hidden="true"><path d="m298-309-70-71q51-48 116-74t136-26q71 0 136 26t116 74l-70 71q-38-35-84.5-53T480-380q-51 0-97.5 18T298-309ZM73-536 2-607q97-94 220.5-143.5T480-800q134 0 257.5 49.5T958-607l-71 71q-82-79-187-121.5T480-700q-115 0-220 42.5T73-536Zm113 114-70-71q74-71 168-109t197-38q103 0 196.5 37.5T845-494l-70 71q-60-57-136.5-87T480-540q-83 0-158.5 30.5T186-422Zm294 262q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Z" fill="currentColor"/></svg>';
    case "Gyro (likely)":
      return '<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="12" r="3"/><path d="M4 12h16M12 4v16" stroke-width="2" fill="none"/></svg>';
    case "ignored":
      return '<svg viewBox="0 0 24 24" class="icon"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><path d="M3 3l18 18" stroke-width="2"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" class="icon"><circle cx="12" cy="12" r="2"/></svg>';
  }
}

function featuresToChips(features: string[]): string[] {
  return features.map((f) => chip(f, f));
}

function vibeButton(index: number): string {
  return `
    <button class="btn icon-only" id="pad-vibrate-${index}" aria-label="Test vibration" title="Test vibration">
      <svg class="icon" viewBox="0 -960 960 960" aria-hidden="true">
        <path d="M750-614q-27 27-62 41t-70 14q-35 0-69-13.5T488-614l-75-75q-15-15-34-22.5t-39-7.5q-20 0-39 7.5T267-689l-75 75-57-57 75-75q27-27 61-40.5t69-13.5q35 0 68.5 13.5T469-746l75 75q16 16 35 23.5t39 7.5q20 0 39.5-7.5T693-671l75-75 57 57-75 75Zm0 200q-27 27-61.5 40.5T619-360q-35 0-69.5-13.5T488-414l-75-75q-15-15-34-22.5t-39-7.5q-20 0-39 7.5T267-489l-75 75-57-56 75-76q27-27 61-40.5t69-13.5q35 0 68.5 13.5T469-546l75 75q16 16 35 23.5t39 7.5q20 0 39.5-7.5T693-471l75-75 57 57-75 75Zm-1 200q-27 27-61 40.5T619-160q-35 0-69.5-13.5T488-214l-76-75q-15-15-34-22.5t-39-7.5q-20 0-39 7.5T266-289l-75 75-56-56 75-76q27-27 61-40.5t69-13.5q35 0 68.5 13.5T469-346l75 75q16 16 35.5 23.5T619-240q20 0 39-7.5t35-23.5l75-75 56 57-75 75Z" fill="currentColor"/>
      </svg>
    </button>
  `;
}

function bindPadControls(modal: ControllersModal, p: Pad): void {
  const vibrateBtn = modal.querySelector(`#pad-vibrate-${p.index}`);
  vibrateBtn?.addEventListener("click", async () => {
    try {
      const actuator = (p as any).vibrationActuator;
      if (actuator?.playEffect) {
        await actuator.playEffect("dual-rumble", {
          duration: 120,
          strongMagnitude: 1.0,
          weakMagnitude: 0.5,
        });
      }
    } catch {}
  });
}

import { api } from "../api";
import { showPopup } from "./toast";
import { playClick, playError, playComplete } from "./sounds";
import { makeDropdown, type Dropdown, type DropdownOption } from "./dom";
import type { DownloadStatus, SystemConfig } from "../types";

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ProgRow {
  row: HTMLDivElement;
  inner: HTMLDivElement;
  text: HTMLSpanElement;
  cancel: HTMLButtonElement;
}

export function openDownloaderModal(): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay show";
  overlay.setAttribute("role", "dialog");

  const modal = document.createElement("div");
  modal.className = "modal modal-enter switch-modal";
  modal.innerHTML = `
    <div class="modal-header">Downloader</div>
    <div class="modal-body">
      <div class="section">
        <div class="row"><div class="label">Nintendo DS Emulator</div><div class="control"></div></div>
        <div class="row"><div class="label">Nintendo DSi Emulator</div><div class="control"></div></div>
        <div class="row"><div class="label">Nintendo 3DS Emulator</div><div class="control"></div></div>
        <div class="row"><div class="label">Nintendo Wii Emulator</div><div class="control"></div></div>
        <div class="row"><div class="label">Nintendo Wii U Emulator</div><div class="control"></div></div>
        <div class="row"><div class="label">Nintendo Switch Emulator</div><div class="control"></div></div>
      </div>
    </div>
    <div class="modal-footer hint-bar">
      <button class="hint primary" id="btn-close-dl" aria-label="Close" title="Close">
        <span class="glyph"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span>Close</span>
      </button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let unsubStatus: (() => void) | null = null;
  let onKeydown: ((e: KeyboardEvent) => void) | null = null;

  const close = (): void => {
    try {
      emuSelect.value = "";
      startBtn.disabled = true;
      threedSelect.value = "";
      threedStartBtn.disabled = true;
      dsSelect.value = "";
      dsStartBtn.disabled = true;
      dsiSelect.value = "";
      dsiStartBtn.disabled = true;
      wiiSelect.value = "";
      wiiStartBtn.disabled = true;
      wiiuSelect.value = "";
      wiiuStartBtn.disabled = true;
    } catch {
    }
    try {
      unsubStatus?.();
    } catch {
    }
    unsubStatus = null;
    if (onKeydown) {
      document.removeEventListener("keydown", onKeydown);
      onKeydown = null;
    }
    modal.classList.remove("modal-enter");
    modal.classList.add("modal-exit");
    modal.addEventListener("animationend", () => overlay.remove(), { once: true });
  };

  modal.querySelector("#btn-close-dl")?.addEventListener("click", () => close());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeydown, { once: true });

  const makeStart = (): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn icon-only";
    b.title = "Start download";
    b.setAttribute("aria-label", "Start download");
    b.innerHTML =
      '<svg viewBox="0 0 24 24" class="icon"><path d="M12 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M7 12l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>';
    return b;
  };

  const makeProgRow = (): ProgRow => {
    const row = document.createElement("div");
    row.className = "hstack";
    row.style.display = "none";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginTop = "8px";
    const wrap = document.createElement("div");
    wrap.className = "progress";
    const inner = document.createElement("div");
    inner.className = "bar";
    const text = document.createElement("span");
    text.className = "value";
    wrap.appendChild(inner);
    wrap.appendChild(text);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn icon-only ghost";
    cancel.title = "Cancel download";
    cancel.setAttribute("aria-label", "Cancel download");
    cancel.style.display = "none";
    cancel.innerHTML =
      '<svg viewBox="0 0 24 24" class="icon"><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke-width="2" stroke-linecap="round"></path></svg>';
    cancel.addEventListener("click", async () => {
      try {
        await api.cancelDownload();
      } catch {
      }
    });
    row.appendChild(wrap);
    row.appendChild(cancel);
    return { row, inner, text, cancel };
  };

  const rows = modal.querySelectorAll<HTMLElement>(".section .row");
  const [rowDs, rowDsi, row3ds, rowWii, rowWiiu, rowSw] = Array.from(rows);
  const mount = (rowEl?: HTMLElement): HTMLElement | null =>
    rowEl?.querySelector<HTMLElement>(".control") ?? null;
  const dsCtrl = mount(rowDs);
  const dsiCtrl = mount(rowDsi);
  const threedCtrl = mount(row3ds);
  const wiiCtrl = mount(rowWii);
  const wiiuCtrl = mount(rowWiiu);
  const swCtrl = mount(rowSw);

  const buildGroup = (
    select: Dropdown,
    startBtn: HTMLButtonElement,
    prog: ProgRow,
    container: HTMLElement | null
  ): void => {
    const top = document.createElement("div");
    top.className = "hstack";
    top.style.gap = "8px";
    top.appendChild(select);
    top.appendChild(startBtn);
    const group = document.createElement("div");
    group.className = "vstack";
    group.style.gap = "16px";
    group.appendChild(top);
    group.appendChild(prog.row);
    container?.appendChild(group);
  };

  const dsSelect = makeDropdown();
  const dsStartBtn = makeStart();
  dsStartBtn.disabled = true;
  const dsProg = makeProgRow();
  buildGroup(dsSelect, dsStartBtn, dsProg, dsCtrl);

  const dsiSelect = makeDropdown();
  const dsiStartBtn = makeStart();
  dsiStartBtn.disabled = true;
  const dsiProg = makeProgRow();
  buildGroup(dsiSelect, dsiStartBtn, dsiProg, dsiCtrl);

  const threedSelect = makeDropdown();
  const threedStartBtn = makeStart();
  threedStartBtn.disabled = true;
  const threedProg = makeProgRow();
  buildGroup(threedSelect, threedStartBtn, threedProg, threedCtrl);

  const wiiSelect = makeDropdown();
  const wiiStartBtn = makeStart();
  wiiStartBtn.disabled = true;
  const wiiProg = makeProgRow();
  buildGroup(wiiSelect, wiiStartBtn, wiiProg, wiiCtrl);

  const wiiuSelect = makeDropdown();
  const wiiuStartBtn = makeStart();
  wiiuStartBtn.disabled = true;
  const wiiuProg = makeProgRow();
  buildGroup(wiiuSelect, wiiuStartBtn, wiiuProg, wiiuCtrl);

  const emuSelect = makeDropdown();
  const startBtn = makeStart();
  startBtn.disabled = true;
  const swProg = makeProgRow();
  buildGroup(emuSelect, startBtn, swProg, swCtrl);

  let downloading = false;
  let activeProgRow: HTMLDivElement = swProg.row;
  let activeCancelBtn: HTMLButtonElement = swProg.cancel;
  let activeProgInner: HTMLDivElement = swProg.inner;
  let activeProgText: HTMLSpanElement = swProg.text;

  const setDownloading = (v: boolean): void => {
    downloading = v;
    emuSelect.disabled = v;
    startBtn.disabled = v || !emuSelect.value;
    threedSelect.disabled = v;
    threedStartBtn.disabled = v || !threedSelect.value;
    dsSelect.disabled = v;
    dsStartBtn.disabled = v || !dsSelect.value;
    dsiSelect.disabled = v;
    dsiStartBtn.disabled = v || !dsiSelect.value;
    wiiSelect.disabled = v;
    wiiStartBtn.disabled = v || !wiiSelect.value;
    wiiuSelect.disabled = v;
    wiiuStartBtn.disabled = v || !wiiuSelect.value;
    activeCancelBtn.style.display = v ? "" : "none";
    activeProgRow.style.display = v ? "" : "none";
    if (!v) {
      activeProgInner.style.width = "0%";
      activeProgText.textContent = "";
    }
  };

  const emuOptions = (sys?: SystemConfig): DropdownOption[] =>
    (sys?.emulators ?? [])
      .filter((e) => !!e.source)
      .map((e) => ({ value: e.id, label: e.name }));

  (async () => {
    try {
      const cfg = await api.getConfig();
      dsSelect.setOptions(emuOptions(cfg?.["Nintendo DS"]));
      dsiSelect.setOptions(emuOptions(cfg?.["Nintendo DSi"]));
      threedSelect.setOptions(emuOptions(cfg?.["Nintendo 3DS"]));
      wiiSelect.setOptions(emuOptions(cfg?.["Nintendo Wii"]));
      wiiuSelect.setOptions(emuOptions(cfg?.["Nintendo Wii U"]));
      emuSelect.setOptions(emuOptions(cfg?.["Nintendo Switch"]));
      dsStartBtn.disabled = true;
      dsiStartBtn.disabled = true;
      threedStartBtn.disabled = true;
      wiiStartBtn.disabled = true;
      wiiuStartBtn.disabled = true;
      startBtn.disabled = true;
    } catch (e) {
      console.error("[downloader] populate failed", e);
    }
  })();

  emuSelect.addEventListener("change", () => {
    startBtn.disabled = downloading || !emuSelect.value;
  });
  threedSelect.addEventListener("change", () => {
    threedStartBtn.disabled = downloading || !threedSelect.value;
  });
  dsSelect.addEventListener("change", () => {
    dsStartBtn.disabled = downloading || !dsSelect.value;
  });
  dsiSelect.addEventListener("change", () => {
    dsiStartBtn.disabled = downloading || !dsiSelect.value;
  });
  wiiSelect.addEventListener("change", () => {
    wiiStartBtn.disabled = downloading || !wiiSelect.value;
  });
  wiiuSelect.addEventListener("change", () => {
    wiiuStartBtn.disabled = downloading || !wiiuSelect.value;
  });

  const useActive = (prog: ProgRow): void => {
    activeProgRow = prog.row;
    activeCancelBtn = prog.cancel;
    activeProgInner = prog.inner;
    activeProgText = prog.text;
  };

  startBtn.addEventListener("click", async () => {
    const key = emuSelect.value;
    if (!key || downloading) return;
    playClick();
    useActive(swProg);
    setDownloading(true);
    try {
      const res = await api.downloadSystem("Nintendo Switch", key);
      if (!res?.ok) throw new Error(res?.error || "Download failed");
    } catch {
    } finally {
      setDownloading(false);
    }
  });

  threedStartBtn.addEventListener("click", async () => {
    const key = threedSelect.value;
    if (!key || downloading) return;
    playClick();
    useActive(threedProg);
    setDownloading(true);
    try {
      const res = await api.downloadSystem("Nintendo 3DS", key);
      if (!res?.ok) throw new Error(res?.error || "Download failed");
    } catch {
    } finally {
      setDownloading(false);
    }
  });

  dsStartBtn.addEventListener("click", async () => {
    const key = dsSelect.value;
    if (!key || downloading) return;
    playClick();
    useActive(dsProg);
    setDownloading(true);
    try {
      const res = await api.downloadSystem("Nintendo DS", key);
      if (!res?.ok) throw new Error(res?.error || "Download failed");
    } catch {
    } finally {
      setDownloading(false);
    }
  });

  dsiStartBtn.addEventListener("click", async () => {
    const key = dsiSelect.value;
    if (!key || downloading) return;
    playClick();
    useActive(dsiProg);
    setDownloading(true);
    try {
      const res = await api.downloadSystem("Nintendo DSi", key);
      if (!res?.ok) throw new Error(res?.error || "Download failed");
    } catch {
    } finally {
      setDownloading(false);
    }
  });

  wiiStartBtn.addEventListener("click", async () => {
    const key = wiiSelect.value;
    if (!key || downloading) return;
    playClick();
    useActive(wiiProg);
    setDownloading(true);
    try {
      const res = await api.downloadSystem("Nintendo Wii", key);
      if (!res?.ok) throw new Error(res?.error || "Download failed");
    } catch {
    } finally {
      setDownloading(false);
    }
  });

  wiiuStartBtn.addEventListener("click", async () => {
    const key = wiiuSelect.value;
    if (!key || downloading) return;
    playClick();
    useActive(wiiuProg);
    setDownloading(true);
    try {
      const res = await api.downloadSystem("Nintendo Wii U", key);
      if (!res?.ok) throw new Error(res?.error || "Download failed");
    } catch {
    } finally {
      setDownloading(false);
    }
  });

  const statusListener = (p: DownloadStatus): void => {
    const s = p?.status;
    if (!activeProgRow) return;
    if (s === "start") {
      setDownloading(true);
    } else if (s === "progress") {
      const total = p?.total || 0;
      if (total > 0) {
        const received = p?.received ?? 0;
        const pct = Math.max(
          0,
          Math.min(100, p?.percent ?? Math.floor((received / total) * 100))
        );
        activeProgInner.style.width = pct + "%";
        activeProgText.textContent = pct + "%";
      } else {
        const now = Date.now() % 1000;
        const pct = Math.floor((now / 1000) * 100);
        activeProgInner.style.width = pct + "%";
        activeProgText.textContent = "";
      }
    } else if (s === "extracting") {
      activeProgText.textContent = "Extracting…";
      activeProgInner.style.width = "100%";
    } else if (s === "done") {
      setDownloading(false);
      playComplete();
      showPopup("Download completed", "success");
    } else if (s === "error") {
      setDownloading(false);
      playError();
      showPopup("Download failed", "error");
    }
  };
  unsubStatus = api.onDownloadStatus(statusListener);

  void escapeHtml;
}

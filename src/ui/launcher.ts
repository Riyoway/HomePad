import { api } from "../api";
import { showPopup } from "./toast";
import { playClick, playError, playComplete } from "./sounds";
import type { Settings, AppPopup } from "../types";

function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"]+/g,
    (ch) =>
      (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }) as Record<string, string>)[ch],
  );
}

function getLoadingEl(): HTMLElement | null {
  return document.getElementById("loading-overlay");
}

function showLoading(text = "Launching..."): void {
  const el = getLoadingEl();
  if (!el) return;
  const t = el.querySelector(".loading-text");
  if (t) t.textContent = text;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}

function hideLoading(): void {
  const el = getLoadingEl();
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

export function showErrorDialog(title = "Error", message = ""): Promise<void> {
  return new Promise<void>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay show";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Error");

    const modal = document.createElement("div");
    modal.className = "modal error jump-in";
    modal.innerHTML = `
      <div class="modal-header">${escapeHtml(title)}</div>
      <div class="modal-body">
        <div class="section">
          <div class="error-box">${escapeHtml(String(message))}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn icon-only primary" id="btn-ok" aria-label="OK" title="OK">
          <svg viewBox="0 0 24 24" class="icon" aria-hidden="true">
            <path d="M5 13l4 4L19 7" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
      modal.classList.remove("jump-in");
      modal.classList.add("modal-exit");
      modal.addEventListener(
        "animationend",
        () => {
          overlay.remove();
          resolve();
        },
        { once: true },
      );
    };
    modal.querySelector("#btn-ok")?.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  });
}

function waitUntilExternalShown(maxMs = 15000): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        cleanup();
        resolve();
      }
    };
    const onBlur = () => finish();
    const onVis = () => {
      if (document.hidden || document.visibilityState === "hidden") finish();
    };
    const cleanup = () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
    window.addEventListener("blur", onBlur, { once: true });
    document.addEventListener("visibilitychange", onVis, { once: true });
    setTimeout(finish, Math.max(1000, maxMs));
  });
}

export function setupAppsContextMenu(): void {
  const strip = document.getElementById("apps");
  if (!strip || strip.dataset.ctxMenu === "1") return;
  strip.dataset.ctxMenu = "1";

  const getSettings = async (): Promise<Settings> => {
    try {
      return await api.getSettings();
    } catch {
      return {};
    }
  };

  const killMenu = () => document.querySelectorAll(".ctxmenu").forEach((el) => el.remove());

  const pathToFileUrl = (p: unknown): string => {
    if (!p || typeof p !== "string") return "";
    let s = p.replace(/\\/g, "/");
    if (!/^\w:\//.test(s) && !s.startsWith("/")) return "";
    if (/^\w:\//.test(s)) s = "/" + s;
    return "file://" + s;
  };

  const makeItem = (label: string, onClick: () => void | Promise<void>, disabled = false) => {
    const li = document.createElement("div");
    li.className = "ctx-item";
    li.textContent = label;
    li.setAttribute("role", "menuitem");
    if (disabled) li.classList.add("disabled");
    if (!disabled)
      li.addEventListener("click", async (e) => {
        e.stopPropagation();
        killMenu();
        await onClick();
      });
    return li;
  };

  const buildMenu = async (name: string, x: number, y: number) => {
    killMenu();
    const menu = document.createElement("div");
    menu.className = "ctxmenu";
    menu.setAttribute("role", "menu");

    const sep = () => {
      const s = document.createElement("div");
      s.className = "ctx-sep";
      return s;
    };

    const settings = await getSettings();
    const emuDir = settings?.emulator?.paths?.[name] || "";
    const emuDirUrl = pathToFileUrl(emuDir);
    const is3ds = name === "Nintendo 3DS";
    const isWiiU = name === "Nintendo Wii U";

    const doLaunch = async (action: string) => {
      try {
        playClick();
        showLoading(`Launching ${name}...`);
        const res = await api.launchAction(name, action);
        if (!res?.ok) {
          await showErrorDialog(
            "Launch Failed",
            `Failed to launch ${name}:\n${res?.error || "Unknown error"}`,
          );
          hideLoading();
          return;
        }
        await waitUntilExternalShown(15000);
        hideLoading();
      } catch (err) {
        await showErrorDialog("Launch Error", `Failed to launch ${name}:\n${String(err)}`);
        hideLoading();
      }
    };

    const doOpenFolder = async (url: string) => {
      if (!url) {
        playError();
        showPopup("Folder not set", "error");
        return;
      }
      try {
        await api.openExternal(url);
      } catch {
        playError();
        showPopup("Failed to open folder", "error");
      }
    };

    menu.appendChild(makeItem("Launch Home Menu", () => doLaunch("system-menu")));
    menu.appendChild(makeItem("Launch Emulator", () => doLaunch("emulator")));
    menu.appendChild(sep());
    menu.appendChild(makeItem("Open Emulator Folder", () => doOpenFolder(emuDirUrl), !emuDirUrl));

    if (is3ds) {
      const raw = settings?.emulator?.nandDir || "";
      const expanded = raw ? await api.expandPath(raw) : "";
      const ok = expanded ? await api.pathExists(expanded, "dir") : false;
      const url = ok ? pathToFileUrl(expanded) : "";
      menu.appendChild(makeItem("Open NAND Folder", () => doOpenFolder(url), !url));
    }
    if (isWiiU) {
      const mlc = await api.getWiiUMlcPath();
      const ok = mlc ? await api.pathExists(mlc, "dir") : false;
      const url = ok ? pathToFileUrl(mlc) : "";
      menu.appendChild(makeItem("Open MLC Folder", () => doOpenFolder(url), !url));
    }

    document.body.appendChild(menu);
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const rect = menu.getBoundingClientRect();
    const posX = Math.min(x, vw - rect.width - 8);
    const posY = Math.min(y, vh - rect.height - 8);
    menu.style.left = posX + "px";
    menu.style.top = posY + "px";

    const dismiss = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) killMenu();
    };
    setTimeout(() => {
      document.addEventListener("mousedown", dismiss, { once: true });
    }, 0);
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") killMenu();
      },
      { once: true },
    );
  };

  strip.addEventListener("contextmenu", async (e) => {
    const target = e.target as HTMLElement | null;
    const card = target?.closest ? target.closest(".app-card") : null;
    if (!card) return;
    e.preventDefault();
    const name = card.getAttribute("data-app");
    if (!name) return;
    await buildMenu(name, e.clientX, e.clientY);
  });
}

export function setupAppsClickDelegation(): void {
  const strip = document.getElementById("apps");
  if (!strip || strip.dataset.clickDelegation === "1") return;
  strip.dataset.clickDelegation = "1";
  strip.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement | null;
    const card = target?.closest ? (target.closest(".app-card") as HTMLElement | null) : null;
    if (!card) return;
    try {
      card.focus?.();
    } catch {}
    const name = card.getAttribute("data-app");
    if (!name) return;
    if (card.classList.contains("disabled") || card.getAttribute("aria-disabled") === "true") {
      try {
        playError();
      } catch {}
      await showErrorDialog(
        "Missing Emulator Folder",
        `No emulator folder set for "${name}".\nOpen Settings and set the folder containing the emulator executable.`,
      );
      return;
    }
    playClick();
    try {
      try {
        console.log("[ui] delegation launch:", name);
      } catch {}
      showLoading(`Launching ${name}...`);
      const res = await api.launch(name);
      if (!res?.ok) {
        console.warn("Launch failed (delegation):", res?.error);
        const msg = res?.error || "Unknown error";
        await showErrorDialog("Launch Failed", `Failed to launch ${name}:\n${msg}`);
        try {
          playError();
        } catch {}
        hideLoading();
        return;
      }
      await waitUntilExternalShown(15000);
      hideLoading();
    } catch (err) {
      console.error("Launch error (delegation):", err);
      await showErrorDialog("Launch Error", `Failed to launch ${name}:\n${String(err)}`);
      hideLoading();
    }
  });
}

let appPopupUnlisten: (() => void) | null = null;

export function setupAppPopups(): () => void {
  if (appPopupUnlisten) return appPopupUnlisten;
  const unlisten = api.onAppPopup((p: AppPopup) => {
    const t = p?.type || "info";
    const msg = p?.message || "";
    if (t === "error") playError();
    else if (t === "success") playComplete();
    else playClick();
    showPopup(msg, t);
  });
  appPopupUnlisten = () => {
    try {
      unlisten();
    } finally {
      appPopupUnlisten = null;
    }
  };
  return appPopupUnlisten;
}

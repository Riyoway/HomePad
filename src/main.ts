import "./styles/index.css";
import { api } from "./api";
import type { Theme } from "./types";
import { renderAppsFromConfig } from "./ui/data";
import { initAppsScroller } from "./ui/scroller";
import {
  setupAppsClickDelegation,
  setupAppsContextMenu,
  setupAppPopups,
} from "./ui/launcher";
import { showSettings } from "./ui/settings";
import { openDownloaderModal } from "./ui/downloader";
import { openControllersModal, setupGamepadIndicator } from "./ui/controllers";
import { openHelpModal } from "./ui/help";
import { setupStatus } from "./ui/status";
import { setupConsoleMode, toggleConsoleMode } from "./ui/console";
import { playClick } from "./ui/sounds";

const LINKS = {
  website: "https://github.com/Riyoway/Lovemu",
  update: "https://github.com/Riyoway/Lovemu/releases",
};

function setThemeLink(theme: Theme | string): void {
  const link = document.getElementById("theme-css") as HTMLLinkElement | null;
  if (!link) return;
  const t = theme === "light" ? "light" : "dark";
  const href = `/themes/${t}.css`;
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

async function applyThemeFromSettings(): Promise<void> {
  try {
    const s = await api.getSettings();
    setThemeLink(s?.display?.theme || "dark");
  } catch {
    setThemeLink("dark");
  }
}

function disableNativeTooltips(): void {
  const moveTitle = (el: Element) => {
    try {
      const t = el.getAttribute("title");
      if (t != null) {
        if (!el.hasAttribute("aria-label") && String(t).trim()) {
          el.setAttribute("aria-label", String(t));
        }
        el.removeAttribute("title");
      }
    } catch {}
  };
  try {
    document.querySelectorAll("[title]").forEach(moveTitle);
  } catch {}
  try {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "title" && m.target) {
          moveTitle(m.target as Element);
        }
        if (m.type === "childList" && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
              const el = n as Element;
              if (el.hasAttribute("title")) moveTitle(el);
              try {
                el.querySelectorAll("[title]").forEach(moveTitle);
              } catch {}
            }
          });
        }
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });
  } catch {}
}

function wireFooter(): void {
  const click = (id: string, fn: () => void) =>
    document.getElementById(id)?.addEventListener("click", () => {
      playClick();
      fn();
    });
  click("btn-exit", () => api.quit());
  click("btn-settings", () => void showSettings());
  click("btn-help", () => openHelpModal());
  click("btn-controllers", () => openControllersModal());
  click("btn-downloader", () => openDownloaderModal());
  click("btn-website", () => void api.openExternal(LINKS.website));
  click("btn-update", () => void api.openExternal(LINKS.update));
  click("btn-fullscreen", () => void toggleConsoleMode());
}

function boot(): void {
  disableNativeTooltips();
  applyThemeFromSettings();
  wireFooter();
  renderAppsFromConfig().then(() => {
    initAppsScroller();
    setupAppsClickDelegation();
    setupAppsContextMenu();
  });
  setupGamepadIndicator();
  setupStatus();
  setupAppPopups();
  setupConsoleMode();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

document.addEventListener("settings:updated", () => {
  applyThemeFromSettings();
  const el = document.getElementById("apps") as (HTMLElement & { _inertiaRAF?: number }) | null;
  if (el) {
    if (el._inertiaRAF) {
      try {
        cancelAnimationFrame(el._inertiaRAF);
      } catch {}
      el._inertiaRAF = 0;
    }
    try {
      el.style.scrollBehavior = "";
    } catch {}
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    if (el.scrollLeft < 0) el.scrollLeft = 0;
    else if (el.scrollLeft > max) el.scrollLeft = max;
  }
  renderAppsFromConfig().then(() => {
    initAppsScroller();
    setupAppsClickDelegation();
  });
});

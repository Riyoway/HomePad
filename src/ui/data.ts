import { api } from "../api";
import type { SystemConfig } from "../types";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLACEHOLDER_SVG =
  '<svg viewBox="0 0 48 48" class="tile-icon"><rect x="6" y="6" width="36" height="36" rx="8"/></svg>';

export async function renderAppsFromConfig(): Promise<void> {
  const container = document.getElementById("apps");
  if (!container) return;
  container.innerHTML = "";

  const cfg = await api.getConfig();
  if (!cfg || typeof cfg !== "object") return;

  try {
    console.log("[ui] renderAppsFromConfig: systems=", Object.keys(cfg));
  } catch {}

  let settings: Awaited<ReturnType<typeof api.getSettings>> = {};
  try {
    settings = await api.getSettings();
  } catch {
    settings = {};
  }
  const paths = settings?.emulator?.paths || {};

  const systems = Object.keys(cfg);
  for (const name of systems) {
    const btn = document.createElement("button");
    btn.className = "app-card";
    btn.setAttribute("data-app", name);
    btn.setAttribute("aria-label", name);

    const icon = document.createElement("div");
    icon.className = "app-icon";

    const def: SystemConfig = cfg[name] || {};
    const iconList = Array.isArray(def.icon) ? def.icon : [];
    const iconPaths = iconList
      .map((i) =>
        typeof i === "string" ? i : i && (i as any).path ? (i as any).path : null,
      )
      .filter((p): p is string => Boolean(p));

    const imgPath = iconPaths[0] ?? null;
    if (imgPath) {
      const loader = document.createElement("div");
      loader.className = "img-loader";
      icon.appendChild(loader);

      const img = document.createElement("img");
      img.alt = `${name} icon`;
      img.className = "tile-img is-loading";

      img.addEventListener(
        "load",
        () => {
          img.classList.remove("is-loading");
          loader.remove();
        },
        { once: true },
      );
      img.addEventListener(
        "error",
        () => {
          try {
            loader.remove();
          } catch {}
          icon.innerHTML = PLACEHOLDER_SVG;
        },
        { once: true },
      );

      img.src = imgPath;
      icon.appendChild(img);
    } else {
      icon.innerHTML = PLACEHOLDER_SVG;
    }

    const label = document.createElement("div");
    label.className = "app-name";
    label.textContent = name;

    btn.appendChild(icon);
    btn.appendChild(label);

    const hasPath = !!paths[name];
    try {
      console.log("[ui] tile", name, "path=", paths[name] || "(none)", "enabled=", !!hasPath);
    } catch {}
    if (!hasPath) {
      btn.classList.add("disabled");
      btn.title = "Set emulator folder in Settings";
      btn.setAttribute("aria-disabled", "true");
    }

    container.appendChild(btn);
  }
}

export { escapeHtml };

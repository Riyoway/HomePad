import { api } from "../api";
import { showPopup } from "./toast";
import { playClick } from "./sounds";

const RELEASES_FALLBACK = "https://github.com/Riyoway/HomePad/releases";

type UpdateInfo = Awaited<ReturnType<typeof api.checkUpdate>>;

// Triggered by the toolbar "Check for Updates" button.
export async function checkForUpdates(): Promise<void> {
  showPopup("Checking for updates…", "info");
  let info: UpdateInfo;
  try {
    info = await api.checkUpdate();
  } catch {
    showPopup("Couldn't reach GitHub to check for updates", "error");
    return;
  }
  if (!info?.ok) {
    showPopup("Couldn't check for updates", "error");
    return;
  }
  if (info.noReleases) {
    showPopup(`No releases published yet (you're on v${info.current})`, "info");
    return;
  }
  if (!info.hasUpdate) {
    showPopup(`HomePad is up to date (v${info.current})`, "success");
    return;
  }
  openUpdateModal(info);
}

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

function openUpdateModal(info: UpdateInfo): void {
  const current = String(info.current || "");
  const latest = String(info.latest || "").replace(/^v/i, "");
  const relName = info.name && String(info.name).trim() ? String(info.name).trim() : `Version ${latest}`;
  const notes = String(info.notes || "").trim();
  const url = info.url || RELEASES_FALLBACK;

  const overlay = document.createElement("div");
  overlay.className = "overlay show";
  overlay.setAttribute("role", "dialog");

  const modal = document.createElement("div");
  modal.className = "modal switch-modal update-modal jump-in";
  modal.setAttribute("aria-label", "Update available");

  const header = document.createElement("div");
  header.className = "modal-header";
  header.textContent = "Update Available";

  const body = document.createElement("div");
  body.className = "modal-body";

  const versions = document.createElement("div");
  versions.className = "update-versions";
  versions.appendChild(span("ver-cur", `v${current}`));
  versions.appendChild(span("ver-arrow", "→"));
  versions.appendChild(span("ver-new", `v${latest}`));
  if (info.prerelease) versions.appendChild(span("ver-tag", "pre-release"));
  body.appendChild(versions);

  body.appendChild(span("update-relname", relName));

  if (notes) {
    const pre = document.createElement("pre");
    pre.className = "update-notes";
    pre.textContent = notes;
    body.appendChild(pre);
  }

  const footer = document.createElement("div");
  footer.className = "modal-footer hint-bar";
  const laterBtn = document.createElement("button");
  laterBtn.type = "button";
  laterBtn.className = "hint";
  laterBtn.innerHTML =
    '<span class="glyph"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span>Later</span>';
  const dlBtn = document.createElement("button");
  dlBtn.type = "button";
  dlBtn.className = "hint primary";
  dlBtn.innerHTML =
    '<span class="glyph"><svg viewBox="0 0 24 24"><path d="M12 4v10M8 11l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span>Download</span>';
  footer.appendChild(laterBtn);
  footer.appendChild(dlBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  const close = (): void => {
    document.removeEventListener("keydown", onKeydown);
    modal.classList.remove("jump-in");
    modal.classList.add("modal-exit");
    modal.addEventListener("animationend", () => overlay.remove(), { once: true });
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  laterBtn.addEventListener("click", () => {
    playClick();
    close();
  });
  dlBtn.addEventListener("click", () => {
    playClick();
    void api.openExternal(url);
    close();
  });
  document.addEventListener("keydown", onKeydown);
}

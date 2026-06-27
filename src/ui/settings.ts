import { api } from "../api";
import { showPopup } from "./toast";
import { playClick, playError, playComplete } from "./sounds";
import { makeDropdown } from "./dom";
import type { Settings, EmulatorSettings } from "../types";
import { ICON_VARIANTS } from "./icons";

let current: Settings = {};
let systemNames: string[] = [];

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadSettings(): Promise<Settings> {
  try {
    current = await api.getSettings();
  } catch {
    current = { audio: {}, emulator: {}, downloader: {}, display: {} };
  }
  return current;
}

function ensureOverlay(): HTMLElement {
  let ov = document.getElementById("overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "overlay";
    ov.className = "overlay show";
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeSettings();
    });
    document.body.appendChild(ov);
  }
  ov.innerHTML = "";
  ov.style.display = "flex";
  return ov;
}

const NAV_ICONS: Record<string, string> = {
  audio:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round"/></svg>',
  gen:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M19 7h1M4 12h1M11 12h9M4 17h6M16 17h4" stroke-linecap="round"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="17" r="2"/></svg>',
  emu:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="9" rx="4.5"/><path d="M7.5 11v3M6 12.5h3" stroke-linecap="round"/><circle cx="16" cy="11.5" r="1.1"/><circle cx="18" cy="13.5" r="1.1"/></svg>',
  disp:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/></svg>',
};

function tabButton(id: string, label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-item" + (active ? " active" : "");
  btn.dataset.tab = id;
  const ico = document.createElement("span");
  ico.className = "nav-ico";
  ico.innerHTML = NAV_ICONS[id] || "";
  const text = document.createElement("span");
  text.textContent = label;
  btn.appendChild(ico);
  btn.appendChild(text);
  return btn;
}

function row(labelText: string, inputEl: HTMLElement): HTMLDivElement {
  const r = document.createElement("div");
  r.className = "row";
  const l = document.createElement("label");
  l.textContent = labelText;
  l.className = "label";
  const c = document.createElement("div");
  c.className = "control";
  c.appendChild(inputEl);
  r.appendChild(l);
  r.appendChild(c);
  return r;
}

function textInput(placeholder = ""): HTMLInputElement {
  const i = document.createElement("input");
  i.type = "text";
  i.placeholder = placeholder;
  i.className = "text";
  return i;
}

function radio(name: string, value: string, checked: boolean, labelText: string): HTMLLabelElement {
  const w = document.createElement("label");
  w.className = "radio";
  const i = document.createElement("input");
  i.type = "radio";
  i.name = name;
  i.value = value;
  i.checked = !!checked;
  const s = document.createElement("span");
  s.textContent = labelText;
  w.appendChild(i);
  w.appendChild(s);
  return w;
}

function section(title: string): HTMLDivElement {
  const s = document.createElement("div");
  s.className = "section";
  const h = document.createElement("div");
  h.className = "section-title";
  h.textContent = title;
  s.appendChild(h);
  return s;
}

function errorBox(): HTMLDivElement {
  const d = document.createElement("div");
  d.className = "error-box";
  d.style.display = "none";
  return d;
}

function setError(box: HTMLElement | null | undefined, msg: string): void {
  if (!box) return;
  if (!msg) {
    box.style.display = "none";
    box.textContent = "";
    return;
  }
  box.textContent = msg;
  box.style.display = "block";
}

async function loadSystems(): Promise<string[]> {
  try {
    const cfg = await api.getConfig();
    systemNames = Object.keys(cfg || {});
  } catch {
    systemNames = [];
  }
  return systemNames;
}

const FOLDER_SVG =
  '<svg viewBox="0 0 24 24" class="icon"><path d="M4 7h5l2 2h9v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke-width="2" stroke-linejoin="round"/><path d="M4 7V6a2 2 0 0 1 2-2h4l2 3" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';

export async function showSettings(): Promise<void> {
  await loadSettings();
  await loadSystems();
  const ov = ensureOverlay();

  const modal = document.createElement("div");
  modal.className = "modal modal-enter settings-modal switch-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Settings");

  const header = document.createElement("div");
  header.className = "modal-header";
  header.textContent = "Settings";

  const tabs = document.createElement("div");
  tabs.className = "settings-nav";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-orientation", "vertical");
  const tabAudio = tabButton("audio", "Audio", true);
  const tabGen = tabButton("gen", "General", false);
  const tabEmu = tabButton("emu", "Emulator", false);
  const tabDisp = tabButton("disp", "Display", false);
  const allTabs = [tabAudio, tabGen, tabEmu, tabDisp];
  const ids = ["audio", "gen", "emu", "disp"];
  allTabs.forEach((t, i) => {
    const id = ids[i];
    t.setAttribute("role", "tab");
    t.id = `tab-${id}`;
    t.setAttribute("aria-controls", `panel-${id}`);
    t.setAttribute("tabindex", i === 0 ? "0" : "-1");
    t.setAttribute("aria-selected", i === 0 ? "true" : "false");
  });
  tabs.appendChild(tabAudio);
  tabs.appendChild(tabGen);
  tabs.appendChild(tabEmu);
  tabs.appendChild(tabDisp);

  const body = document.createElement("div");
  body.className = "modal-body";

  const secAudio = section("Audio");
  const audioMute = document.createElement("label");
  audioMute.className = "checkbox";
  const audioMuteInput = document.createElement("input");
  audioMuteInput.type = "checkbox";
  audioMuteInput.checked = !!current?.audio?.mute;
  audioMute.appendChild(audioMuteInput);
  {
    const t = document.createElement("span");
    t.textContent = "Mute sounds";
    audioMute.appendChild(t);
  }
  const audioRow = document.createElement("div");
  audioRow.className = "row full";
  const audioCtrl = document.createElement("div");
  audioCtrl.className = "control";
  audioCtrl.appendChild(audioMute);
  audioRow.appendChild(audioCtrl);
  secAudio.appendChild(audioRow);

  const volumeRow = document.createElement("div");
  volumeRow.className = "row";
  const volumeLabel = document.createElement("div");
  volumeLabel.className = "label";
  volumeLabel.textContent = "Volume";
  const volumeCtrl = document.createElement("div");
  volumeCtrl.className = "control";
  const volumeWrap = document.createElement("div");
  volumeWrap.className = "hstack";
  volumeWrap.style.gap = "10px";
  const volumeInput = document.createElement("input");
  volumeInput.type = "range";
  volumeInput.min = "0";
  volumeInput.max = "100";
  volumeInput.step = "1";
  volumeInput.value = String(
    Number.isFinite(current?.audio?.volume) ? (current.audio!.volume as number) : 100
  );
  volumeInput.className = "range";
  const volumeVal = document.createElement("span");
  volumeVal.textContent = `${volumeInput.value}%`;
  volumeVal.className = "value";
  const updateRangeStyle = () => {
    try {
      volumeInput.style.setProperty("--val", `${volumeInput.value}%`);
    } catch {}
  };
  updateRangeStyle();
  volumeInput.addEventListener("input", () => {
    volumeVal.textContent = `${volumeInput.value}%`;
    updateRangeStyle();
  });
  volumeWrap.appendChild(volumeInput);
  volumeWrap.appendChild(volumeVal);
  volumeCtrl.appendChild(volumeWrap);
  volumeRow.appendChild(volumeLabel);
  volumeRow.appendChild(volumeCtrl);
  secAudio.appendChild(volumeRow);

  const secEmu = section("Emulator");
  const modeWrap = document.createElement("div");
  modeWrap.className = "row full";
  const emuModeEmu = radio("emu-mode", "emulator", current?.emulator?.mode !== "home", "Launch Emulator");
  const emuModeHome = radio("emu-mode", "home", current?.emulator?.mode === "home", "Launch Home System");
  const modeInline = document.createElement("div");
  modeInline.className = "controls-inline";
  modeInline.appendChild(emuModeEmu);
  modeInline.appendChild(emuModeHome);
  const modeCtrl = document.createElement("div");
  modeCtrl.className = "control";
  modeCtrl.appendChild(modeInline);
  modeWrap.appendChild(modeCtrl);

  const fullscreenWrap = document.createElement("div");
  fullscreenWrap.className = "row full";
  const fullscreenCtrl = document.createElement("div");
  fullscreenCtrl.className = "control";
  const fullscreenChkLabel = document.createElement("label");
  fullscreenChkLabel.className = "checkbox round";
  const fullscreenChk = document.createElement("input");
  fullscreenChk.type = "checkbox";
  fullscreenChk.checked = !!current?.emulator?.fullscreenHome;
  fullscreenChkLabel.appendChild(fullscreenChk);
  fullscreenChkLabel.appendChild(
    document.createTextNode(" Launch Home in fullscreen (maximize if unsupported)")
  );
  fullscreenCtrl.appendChild(fullscreenChkLabel);
  fullscreenWrap.appendChild(fullscreenCtrl);

  const nandDir = textInput("3DS NAND folder (needed when Launch Home System)");
  nandDir.value = current?.emulator?.nandDir || "";
  if (!nandDir.value) {
    try {
      const suggested = await api.suggest3dsNand();
      if (suggested) nandDir.value = suggested;
    } catch {}
  }
  const validateNandInput = async () => {
    try {
      const v = await api.validate3dsNand(nandDir.value.trim());
      if (!v?.ok) setError(errBox, v?.error || "Invalid 3DS NAND folder");
      else setError(errBox, "");
    } catch {}
  };
  nandDir.addEventListener("change", validateNandInput);
  nandDir.addEventListener("blur", validateNandInput);
  const nandBrowse = document.createElement("button");
  nandBrowse.type = "button";
  nandBrowse.className = "btn icon-only";
  nandBrowse.title = "Browse";
  nandBrowse.setAttribute("aria-label", "Browse 3DS NAND");
  nandBrowse.innerHTML = FOLDER_SVG;
  nandBrowse.addEventListener("click", async () => {
    const res = await api.openDir({
      title: "Select 3DS NAND folder",
      defaultPath: nandDir.value || undefined,
    });
    if (res?.ok && res.path) {
      nandDir.value = res.path;
      try {
        const v = await api.validate3dsNand(nandDir.value);
        if (!v?.ok) setError(errBox, v?.error || "Invalid 3DS NAND folder");
        else setError(errBox, "");
      } catch {}
    }
  });
  const nandFind = document.createElement("button");
  nandFind.type = "button";
  nandFind.className = "btn icon-only";
  nandFind.title = "Find NAND";
  nandFind.setAttribute("aria-label", "Find 3DS NAND");
  nandFind.innerHTML =
    '<svg viewBox="0 0 24 24" class="icon"><circle cx="11" cy="11" r="7" fill="none" stroke-width="2"/><path d="M20 20l-4.2-4.2" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';
  nandFind.addEventListener("click", async () => {
    try {
      const suggested = await api.suggest3dsNand();
      if (suggested) {
        nandDir.value = suggested;
        const v = await api.validate3dsNand(nandDir.value);
        if (!v?.ok) {
          setError(errBox, v?.error || "Invalid 3DS NAND folder");
          showPopup(v?.error || "Invalid 3DS NAND folder", "warning");
        } else {
          setError(errBox, "");
          showPopup("3DS NAND folder validated", "success");
        }
      } else {
        setError(errBox, "3DS NAND folder was not found in common locations");
        showPopup("3DS NAND folder was not found in common locations", "warning");
      }
    } catch (e: any) {
      setError(errBox, String(e?.message || e));
      showPopup(String(e?.message || e), "error");
    }
  });
  const nandGroup = document.createElement("div");
  nandGroup.className = "hstack";
  nandGroup.appendChild(nandDir);
  nandGroup.appendChild(nandBrowse);
  nandGroup.appendChild(nandFind);
  const nandRow = row("3DS NAND Folder", nandGroup);

  const paths = current?.emulator?.paths || {};
  const sysList = document.createElement("div");
  sysList.className = "sys-list";
  for (const name of systemNames) {
    const wrap = document.createElement("div");
    wrap.className = "row";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = name;
    const ctrl = document.createElement("div");
    ctrl.className = "control";
    const input = textInput(`Folder for ${name}`);
    input.value = paths[name] || "";
    input.dataset.system = name;
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "btn icon-only";
    browse.title = "Browse";
    browse.setAttribute("aria-label", `Browse ${name}`);
    browse.innerHTML = FOLDER_SVG;
    // Wii U: we need refreshMlcRow available in the browse handler;
    // declare it here as a let so it can be referenced before definition.
    let refreshMlcRow: (() => void) = () => {};
    browse.addEventListener("click", async () => {
      const res = await api.openDir({
        title: `Select ${name} folder`,
        defaultPath: input.value || undefined,
      });
      if (res?.ok && res.path) {
        input.value = res.path;
        if (name === "Nintendo DS" || name === "Nintendo DSi") {
          try {
            loadMelonDSToml();
          } catch {}
        }
        if (name === "Nintendo Wii U") {
          try {
            const v = await api.validateWiiUHome(input.value);
            if (!v?.ok) setError(errBox, v?.error || "Wii U Home Menu not found");
            else setError(errBox, "");
          } catch {}
          refreshMlcRow();
        }
      }
    });
    const group = document.createElement("div");
    group.className = "hstack";
    group.appendChild(input);
    group.appendChild(browse);
    ctrl.appendChild(group);
    if (name === "Nintendo DS" || name === "Nintendo DSi") {
      const reload = () => {
        try {
          loadMelonDSToml();
        } catch {}
      };
      input.addEventListener("change", reload);
      input.addEventListener("blur", reload);
    }
    wrap.appendChild(label);
    wrap.appendChild(ctrl);
    sysList.appendChild(wrap);

    // Wii U: show the mlc_path from settings.xml so the user can inspect and edit it
    if (name === "Nintendo Wii U") {
      const mlcWrap = document.createElement("div");
      mlcWrap.className = "row";
      mlcWrap.id = "wiiu-mlc-row";

      const mlcLabel = document.createElement("div");
      mlcLabel.className = "label";
      mlcLabel.textContent = "MLC Path (settings.xml)";

      const mlcCtrl = document.createElement("div");
      mlcCtrl.className = "control";

      const mlcInput = textInput("MLC path not found");
      mlcInput.id = "wiiu-mlc-input";

      const mlcBrowse = document.createElement("button");
      mlcBrowse.type = "button";
      mlcBrowse.className = "btn icon-only";
      mlcBrowse.title = "Browse MLC folder";
      mlcBrowse.setAttribute("aria-label", "Browse Wii U MLC folder");
      mlcBrowse.innerHTML = FOLDER_SVG;

      const mlcSave = document.createElement("button");
      mlcSave.type = "button";
      mlcSave.className = "btn icon-only";
      mlcSave.title = "Save MLC path to settings.xml";
      mlcSave.setAttribute("aria-label", "Save MLC path to settings.xml");
      mlcSave.innerHTML =
        '<svg viewBox="0 0 24 24" class="icon"><path d="M5 13l4 4L19 7" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      // Read-only hint showing which XML file is being used
      const mlcHint = document.createElement("div");
      mlcHint.id = "wiiu-mlc-hint";
      mlcHint.style.cssText = "font-size:11px;color:var(--fg-muted);margin-top:2px;word-break:break-all;";

      // Assign the real implementation now that mlcInput and mlcHint exist
      refreshMlcRow = async () => {
        try {
          const info = await api.getWiiUMlcInfo();
          mlcInput.value = info?.mlcPath || "";
          mlcInput.placeholder = info?.mlcPath ? "" : "MLC path not found";
          mlcHint.textContent = info?.xmlPath ? `settings.xml: ${info.xmlPath}` : "settings.xml: not found";
          mlcSave.style.display = info?.xmlPath ? "" : "none";
        } catch {
          mlcHint.textContent = "Failed to read mlc info";
          mlcSave.style.display = "none";
        }
      };

      mlcBrowse.addEventListener("click", async () => {
        const res = await api.openDir({
          title: "Select Wii U MLC folder",
          defaultPath: mlcInput.value || undefined,
        });
        if (res?.ok && res.path) {
          mlcInput.value = res.path;
        }
      });

      mlcSave.addEventListener("click", async () => {
        const val = mlcInput.value.trim();
        if (!val) return;
        try {
          const r = await api.setWiiUMlcPath(val);
          if (r?.ok) {
            showPopup("MLC path saved to settings.xml", "success");
            await refreshMlcRow();
          } else {
            showPopup(r?.error || "Failed to save MLC path", "error");
          }
        } catch (e: any) {
          showPopup(String(e?.message || e), "error");
        }
      });

      const mlcGroup = document.createElement("div");
      mlcGroup.className = "hstack";
      mlcGroup.appendChild(mlcInput);
      mlcGroup.appendChild(mlcBrowse);
      mlcGroup.appendChild(mlcSave);
      mlcCtrl.appendChild(mlcGroup);
      mlcCtrl.appendChild(mlcHint);
      mlcWrap.appendChild(mlcLabel);
      mlcWrap.appendChild(mlcCtrl);
      sysList.appendChild(mlcWrap);

      // Kick off initial load
      refreshMlcRow();
    }
  }


  secEmu.appendChild(modeWrap);
  secEmu.appendChild(fullscreenWrap);
  const updateNandVisibility = () => {
    const checked = modeWrap.querySelector<HTMLInputElement>('input[name="emu-mode"]:checked');
    const isHome = checked?.value === "home";
    nandRow.style.display = isHome ? "" : "none";
  };
  updateNandVisibility();
  modeWrap.addEventListener("change", updateNandVisibility);
  secEmu.appendChild(nandRow);
  const perTitle = document.createElement("div");
  perTitle.className = "subsection-title";
  perTitle.textContent = "Per‑System Emulator Folders";
  secEmu.appendChild(perTitle);
  secEmu.appendChild(sysList);

  const melTitle = document.createElement("div");
  melTitle.className = "subsection-title";
  melTitle.textContent = "melonDS (DS/DSi) BIOS/Firmware/NAND";
  secEmu.appendChild(melTitle);

  function makePathRow(
    labelText: string,
    inputEl: HTMLElement,
    browseBtn: HTMLElement,
    extraBtn?: HTMLElement
  ): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "row";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = labelText;
    const ctrl = document.createElement("div");
    ctrl.className = "control";
    const group = document.createElement("div");
    group.className = "hstack";
    group.style.gap = "8px";
    group.appendChild(inputEl);
    group.appendChild(browseBtn);
    if (extraBtn) group.appendChild(extraBtn);
    ctrl.appendChild(group);
    wrap.appendChild(label);
    wrap.appendChild(ctrl);
    return wrap;
  }

  const dsBIOS9 = textInput("DS BIOS9 (.bin)");
  const dsBIOS7 = textInput("DS BIOS7 (.bin)");
  const dsFW = textInput("DS Firmware (.bin)");
  dsBIOS9.id = "ds-bios9";
  const dsBrowse9 = document.createElement("button");
  dsBrowse9.type = "button";
  dsBrowse9.className = "btn icon-only";
  dsBrowse9.title = "Browse BIOS9";
  dsBrowse9.innerHTML = FOLDER_SVG;
  const dsBrowse7 = document.createElement("button");
  dsBrowse7.type = "button";
  dsBrowse7.className = "btn icon-only";
  dsBrowse7.title = "Browse BIOS7";
  dsBrowse7.innerHTML = dsBrowse9.innerHTML;
  const dsBrowseFW = document.createElement("button");
  dsBrowseFW.type = "button";
  dsBrowseFW.className = "btn icon-only";
  dsBrowseFW.title = "Browse Firmware";
  dsBrowseFW.innerHTML = dsBrowse9.innerHTML;
  dsBIOS7.id = "ds-bios7";
  dsFW.id = "ds-fw";

  const dsiBIOS9 = textInput("DSi BIOS9 (.bin)");
  const dsiBIOS7 = textInput("DSi BIOS7 (.bin)");
  const dsiFW = textInput("DSi Firmware (.bin)");
  const dsiNAND = textInput("DSi NAND (.bin)");
  const dsiBrowse9 = document.createElement("button");
  dsiBrowse9.type = "button";
  dsiBrowse9.className = "btn icon-only";
  dsiBrowse9.title = "Browse BIOS9";
  dsiBrowse9.innerHTML = dsBrowse9.innerHTML;
  const dsiBrowse7 = document.createElement("button");
  dsiBrowse7.type = "button";
  dsiBrowse7.className = "btn icon-only";
  dsiBrowse7.title = "Browse BIOS7";
  dsiBrowse7.innerHTML = dsBrowse9.innerHTML;
  const dsiBrowseFW = document.createElement("button");
  dsiBrowseFW.type = "button";
  dsiBrowseFW.className = "btn icon-only";
  dsiBrowseFW.title = "Browse Firmware";
  dsiBrowseFW.innerHTML = dsBrowse9.innerHTML;
  const dsiBrowseNAND = document.createElement("button");
  dsiBrowseNAND.type = "button";
  dsiBrowseNAND.className = "btn icon-only";
  dsiBrowseNAND.title = "Browse NAND";
  dsiBrowseNAND.innerHTML = dsBrowse9.innerHTML;
  dsiBIOS9.id = "dsi-bios9";
  dsiBIOS7.id = "dsi-bios7";
  dsiFW.id = "dsi-fw";
  dsiNAND.id = "dsi-nand";

  const dsGroupTitle = document.createElement("div");
  dsGroupTitle.className = "section-subtitle";
  dsGroupTitle.textContent = "Nintendo DS";
  const dsiGroupTitle = document.createElement("div");
  dsiGroupTitle.className = "section-subtitle";
  dsiGroupTitle.textContent = "Nintendo DSi";
  const dsRows = document.createElement("div");
  const dsiRows = document.createElement("div");
  dsRows.appendChild(makePathRow("BIOS9", dsBIOS9, dsBrowse9));
  dsRows.appendChild(makePathRow("BIOS7", dsBIOS7, dsBrowse7));
  dsRows.appendChild(makePathRow("Firmware", dsFW, dsBrowseFW));

  dsiRows.appendChild(makePathRow("BIOS9", dsiBIOS9, dsiBrowse9));
  dsiRows.appendChild(makePathRow("BIOS7", dsiBIOS7, dsiBrowse7));
  dsiRows.appendChild(makePathRow("Firmware", dsiFW, dsiBrowseFW));
  dsiRows.appendChild(makePathRow("NAND", dsiNAND, dsiBrowseNAND));

  const melCard = document.createElement("div");
  melCard.className = "settings-card mel-grid";
  const melDsCol = document.createElement("div");
  melDsCol.className = "mel-col";
  melDsCol.appendChild(dsGroupTitle);
  melDsCol.appendChild(dsRows);
  const melDsiCol = document.createElement("div");
  melDsiCol.className = "mel-col";
  melDsiCol.appendChild(dsiGroupTitle);
  melDsiCol.appendChild(dsiRows);
  melCard.appendChild(melDsCol);
  melCard.appendChild(melDsiCol);
  secEmu.appendChild(melCard);

  function getSysDir(name: string): string {
    const el = sysList.querySelector<HTMLInputElement>(`input.text[data-system="${name}"]`);
    return (el && el.value.trim()) || "";
  }

  async function loadMelonDSToml(): Promise<void> {
    try {
      const dsDir = getSysDir("Nintendo DS");
      const dsiDir = getSysDir("Nintendo DSi");
      try {
        dsBIOS9.value = "";
        dsBIOS7.value = "";
        dsFW.value = "";
        dsiBIOS9.value = "";
        dsiBIOS7.value = "";
        dsiFW.value = "";
        dsiNAND.value = "";
      } catch {}
      if (dsDir) {
        await api.melondsEnsureConfig(dsDir);
        const res = await api.melondsRead(dsDir);
        if (res?.ok) {
          const sec: any = res.data?.DS || res.data?.ds || {};
          const v9 = (sec.BIOS9Path || sec.bios9path || "").replace(/^"|"$/g, "").trim();
          dsBIOS9.value = v9;
          const v7 = (sec.BIOS7Path || sec.bios7path || "").replace(/^"|"$/g, "").trim();
          dsBIOS7.value = v7;
          const vfw = (sec.FirmwarePath || sec.firmwarepath || "").replace(/^"|"$/g, "").trim();
          dsFW.value = vfw;
        }
      }
      if (dsiDir) {
        await api.melondsEnsureConfig(dsiDir);
        const res = await api.melondsRead(dsiDir);
        if (res?.ok) {
          const sec: any = res.data?.DSi || res.data?.dsi || {};
          const v9 = (sec.BIOS9Path || sec.bios9path || "").replace(/^"|"$/g, "").trim();
          dsiBIOS9.value = v9;
          const v7 = (sec.BIOS7Path || sec.bios7path || "").replace(/^"|"$/g, "").trim();
          dsiBIOS7.value = v7;
          const vfw = (sec.FirmwarePath || sec.firmwarepath || "").replace(/^"|"$/g, "").trim();
          dsiFW.value = vfw;
          const vnand = (sec.NANDPath || sec.nandpath || "").replace(/^"|"$/g, "").trim();
          dsiNAND.value = vnand;
        }
      }
    } catch (e) {
      console.warn("[melonds] read error", e);
    }
  }

  loadMelonDSToml();

  const binFilter = [{ name: "Binary", extensions: ["bin"] }];
  dsBrowse9.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DS BIOS9",
      defaultPath: dsBIOS9.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsBIOS9.value = r.path;
  });
  dsBrowse7.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DS BIOS7",
      defaultPath: dsBIOS7.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsBIOS7.value = r.path;
  });
  dsBrowseFW.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DS Firmware",
      defaultPath: dsFW.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsFW.value = r.path;
  });
  dsiBrowse9.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DSi BIOS9",
      defaultPath: dsiBIOS9.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsiBIOS9.value = r.path;
  });
  dsiBrowse7.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DSi BIOS7",
      defaultPath: dsiBIOS7.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsiBIOS7.value = r.path;
  });
  dsiBrowseFW.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DSi Firmware",
      defaultPath: dsiFW.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsiFW.value = r.path;
  });
  dsiBrowseNAND.addEventListener("click", async () => {
    const r = await api.openFile({
      title: "Select DSi NAND",
      defaultPath: dsiNAND.value || undefined,
      filters: binFilter,
    });
    if (r?.ok && r.path) dsiNAND.value = r.path;
  });

  const supTitle = document.createElement("div");
  supTitle.className = "subsection-title";
  supTitle.textContent = "Supported Emulators";
  const supWrap = document.createElement("div");
  supWrap.className = "sys-list";
  try {
    const cfgFull = await api.getConfig();
    for (const sysName of systemNames) {
      const sysCfg: any = cfgFull?.[sysName] || {};
      const entries: string[] = Array.isArray(sysCfg.emulators)
        ? sysCfg.emulators.map((e: any) => e?.name).filter((n: any): n is string => !!n)
        : [];
      const rowEl = document.createElement("div");
      rowEl.className = "row";
      const l = document.createElement("div");
      l.className = "label";
      l.textContent = sysName;
      const c = document.createElement("div");
      c.className = "control";
      if (entries.length) {
        const chips = document.createElement("div");
        chips.className = "features";
        for (const name of entries) {
          const chip = document.createElement("span");
          chip.className = "feature-chip";
          chip.textContent = name;
          chips.appendChild(chip);
        }
        c.appendChild(chips);
      } else {
        const empty = document.createElement("span");
        empty.className = "empty-hint";
        empty.textContent = "—";
        c.appendChild(empty);
      }
      rowEl.appendChild(l);
      rowEl.appendChild(c);
      supWrap.appendChild(rowEl);
    }
  } catch (_) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    const l = document.createElement("div");
    l.className = "label";
    l.textContent = "Supported Emulators";
    const c = document.createElement("div");
    c.className = "control";
    c.textContent = "Failed to load from config";
    rowEl.appendChild(l);
    rowEl.appendChild(c);
    supWrap.appendChild(rowEl);
  }
  secEmu.appendChild(supTitle);
  secEmu.appendChild(supWrap);

  const secGen = section("General");
  const discordWrap = document.createElement("label");
  discordWrap.className = "checkbox";
  const discordInput = document.createElement("input");
  discordInput.type = "checkbox";
  discordInput.checked = current?.discord?.enabled !== false;
  discordWrap.appendChild(discordInput);
  {
    const t = document.createElement("span");
    t.textContent = "Enable Discord RPC";
    discordWrap.appendChild(t);
  }
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn icon-only ghost";
  retryBtn.title = "Retry Discord RPC connection";
  retryBtn.setAttribute("aria-label", "Retry Discord RPC connection");
  retryBtn.style.marginLeft = "8px";
  retryBtn.innerHTML =
    '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M3 4v6h6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  retryBtn.style.display = "none";
  retryBtn.addEventListener("click", async () => {
    try {
      retryBtn.disabled = true;
      playClick();
      const res = await api.discordRetry();
      if (res?.ok) {
        showPopup("Reconnected to Discord RPC", "success");
      } else if (res?.error === "disabled") {
        showPopup("Discord RPC is disabled in Settings", "warning");
      } else {
        showPopup("Failed to reconnect Discord RPC", "error");
        playError();
      }
    } catch {
      showPopup("Retry failed with an exception", "error");
      playError();
    } finally {
      retryBtn.disabled = false;
      try {
        const st = await api.getDiscordStatus();
        retryBtn.style.display = st?.enabled && st?.error && discordInput.checked ? "" : "none";
      } catch {}
    }
  });
  discordWrap.appendChild(retryBtn);
  (async () => {
    try {
      const st = await api.getDiscordStatus();
      retryBtn.style.display = st?.enabled && st?.error && discordInput.checked ? "" : "none";
    } catch {
      retryBtn.style.display = "none";
    }
  })();
  discordInput.addEventListener("change", async () => {
    try {
      const st = await api.getDiscordStatus();
      retryBtn.style.display = st?.enabled && st?.error && discordInput.checked ? "" : "none";
    } catch {
      retryBtn.style.display = discordInput.checked ? "" : "none";
    }
  });
  secGen.appendChild(discordWrap);

  const afterSel = makeDropdown("Select action…");
  afterSel.setOptions([
    { value: "nothing", label: "Do nothing" },
    { value: "minimize", label: "Minimize app" },
    { value: "exit", label: "Exit app" },
  ]);
  afterSel.value = current?.emulator?.afterLaunch || "nothing";
  secGen.appendChild(row("After launching emulator", afterSel));

  const dlDirInput = textInput("e.g. %LocalAppData%\\Lovemu\\Emulators");
  dlDirInput.value = current?.downloader?.dir || "%LocalAppData%\\Lovemu\\Emulators";
  (async () => {
    try {
      const expanded = await api.expandPath(dlDirInput.value);
      if (expanded) dlDirInput.value = expanded;
    } catch {}
  })();
  const dlDirBrowse = document.createElement("button");
  dlDirBrowse.type = "button";
  dlDirBrowse.className = "btn icon-only";
  dlDirBrowse.title = "Browse";
  dlDirBrowse.setAttribute("aria-label", "Browse default download folder");
  dlDirBrowse.innerHTML = FOLDER_SVG;
  dlDirBrowse.addEventListener("click", async () => {
    const currentPath = dlDirInput.value?.trim() || "";
    const expandedDefault = await api.expandPath(currentPath);
    let startPath: string | undefined = expandedDefault || undefined;
    try {
      if (startPath && !(await api.pathExists(startPath, "dir"))) startPath = undefined;
    } catch {}
    const res = await api.openDir({
      title: "Select default download folder",
      defaultPath: startPath,
    });
    if (res?.ok && res.path) dlDirInput.value = res.path;
  });
  const dlDirGroup = document.createElement("div");
  dlDirGroup.className = "hstack";
  dlDirGroup.appendChild(dlDirInput);
  dlDirGroup.appendChild(dlDirBrowse);
  secGen.appendChild(row("Default download folder", dlDirGroup));

  const secDisp = section("Display");
  const themeSel = makeDropdown("Select theme…");
  themeSel.setOptions([
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ]);
  themeSel.value = current?.display?.theme || "dark";
  secDisp.appendChild(row("Theme", themeSel));

  const iconColorSel = makeDropdown("Select icon style…");
  iconColorSel.setOptions([
    { value: "white", label: "White" },
    { value: "black", label: "Black" },
    { value: "custom", label: "Custom" },
  ]);
  iconColorSel.value = current?.display?.iconColor || "white";
  secDisp.appendChild(row("Icon style", iconColorSel));

  const customIconsContainer = document.createElement("div");
  customIconsContainer.className = "sys-list";
  customIconsContainer.style.marginTop = "12px";

  const customSubTitle = document.createElement("div");
  customSubTitle.className = "subsection-title";
  customSubTitle.textContent = "Custom Icon Colors";
  customSubTitle.style.borderTop = "none";
  customSubTitle.style.paddingTop = "0";
  customSubTitle.style.marginTop = "0";
  customIconsContainer.appendChild(customSubTitle);

  const customDropdowns: Record<string, ReturnType<typeof makeDropdown>> = {};
  const variantSystems = systemNames.filter((name) => ICON_VARIANTS[name]);

  for (const name of variantSystems) {
    const sysRow = document.createElement("div");
    sysRow.className = "row";

    const sysLabel = document.createElement("div");
    sysLabel.className = "label";
    sysLabel.textContent = `${name} Icon`;

    const sysCtrl = document.createElement("div");
    sysCtrl.className = "control";

    const sysSel = makeDropdown("Select color…");
    sysSel.setOptions([
      { value: "white", label: "White" },
      { value: "black", label: "Black" },
    ]);
    sysSel.value = current?.display?.iconCustomColor?.[name] || "white";
    customDropdowns[name] = sysSel;

    sysCtrl.appendChild(sysSel);
    sysRow.appendChild(sysLabel);
    sysRow.appendChild(sysCtrl);
    customIconsContainer.appendChild(sysRow);
  }

  secDisp.appendChild(customIconsContainer);

  const updateCustomVisibility = () => {
    customIconsContainer.style.display = iconColorSel.value === "custom" ? "block" : "none";
  };
  updateCustomVisibility();
  iconColorSel.addEventListener("change", updateCustomVisibility);

  const errBox = errorBox();
  if (nandDir.value) {
    try {
      const v = await api.validate3dsNand(nandDir.value.trim());
      if (!v?.ok) setError(errBox, v?.error || "Invalid 3DS NAND folder");
    } catch {}
  }

  const footer = document.createElement("div");
  footer.className = "modal-footer hint-bar";
  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "hint";
  btnCancel.title = "Close";
  btnCancel.setAttribute("aria-label", "Close");
  btnCancel.innerHTML =
    '<span class="glyph"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span>Close</span>';
  btnCancel.addEventListener("click", () => closeSettings());

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "hint primary";
  btnSave.title = "Save";
  btnSave.setAttribute("aria-label", "Save");
  btnSave.innerHTML =
    '<span class="glyph"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Save</span>';
  btnSave.addEventListener("click", async () => {
    playClick();
    setError(errBox, "");
    try {
      const mode =
        (document.querySelector<HTMLInputElement>('input[name="emu-mode"]:checked')?.value as
          | EmulatorSettings["mode"]
          | undefined) || "emulator";
      const nand = nandDir.value.trim();
      const newPaths: Record<string, string> = {};
      document.querySelectorAll<HTMLInputElement>(".sys-list input.text").forEach((i) => {
        const v = i.value.trim();
        const key = i.dataset.system;
        if (key) newPaths[key] = v;
      });
      const wiiuDir = newPaths["Nintendo Wii U"];
      if (wiiuDir && mode === "home") {
        const vw = await api.validateWiiUHome(wiiuDir);
        if (!vw?.ok) {
          showPopup(
            vw?.error || "Wii U Home Menu (men.rpx) not found. Check emulator folder/mlc_path",
            "warning"
          );
        }
      }
      const threeDSDir = newPaths["Nintendo 3DS"];
      if (mode === "home" && threeDSDir) {
        if (!nand) {
          setError(
            errBox,
            "3DS NAND folder is required to launch 3DS Home. Set a valid NAND folder or switch mode."
          );
        } else {
          try {
            const v3 = await api.validate3dsNand(nand);
            if (!v3?.ok) {
              setError(errBox, v3?.error || "3DS Home Menu file not found in NAND");
            }
          } catch {}
        }
      }

      for (const [sysName, dirPath] of Object.entries(newPaths)) {
        const p = (dirPath || "").trim();
        if (!p) continue;
        try {
          const exists = await api.pathExists(p, "dir");
          if (!exists) throw new Error(`${sysName} emulator folder not found`);
        } catch {
          throw new Error(`${sysName} emulator folder not found`);
        }
      }

      if (mode === "home") {
        const dsDirPath = newPaths["Nintendo DS"] || "";
        const dsiDirPath = newPaths["Nintendo DSi"] || "";
        if (dsDirPath) {
          try {
            const vds = await api.melondsValidate(dsDirPath, "Nintendo DS");
            if (!vds?.ok)
              showPopup(vds?.error || "Nintendo DS Home Menu requirements not met.", "warning");
          } catch {}
        }
        if (dsiDirPath) {
          try {
            const vdsi = await api.melondsValidate(dsiDirPath, "Nintendo DSi");
            if (!vdsi?.ok)
              showPopup(vdsi?.error || "Nintendo DSi Home Menu requirements not met.", "warning");
          } catch {}
        }
      }

      current.audio = {
        mute: !!audioMuteInput.checked,
        volume: Math.max(0, Math.min(100, parseInt(volumeInput.value, 10) || 0)),
      };
      current.discord = { enabled: !!discordInput.checked };
      current.emulator = {
        mode,
        nandDir: nand,
        paths: newPaths,
        afterLaunch: afterSel.value as EmulatorSettings["afterLaunch"],
        fullscreenHome: !!fullscreenChk.checked,
      };
      current.display = {
        theme: themeSel.value as any,
        iconColor: iconColorSel.value as any,
        iconCustomColor: Object.keys(customDropdowns).reduce(
          (acc, name) => {
            acc[name] = customDropdowns[name].value as "white" | "black";
            return acc;
          },
          {} as Record<string, "white" | "black">
        ),
      };
      current.downloader = { dir: dlDirInput.value.trim() };

      const dsDir = newPaths["Nintendo DS"] || "";
      const dsiDir = newPaths["Nintendo DSi"] || "";
      const dsB9 = (document.getElementById("ds-bios9") as HTMLInputElement)?.value?.trim() || "";
      const dsB7 = (document.getElementById("ds-bios7") as HTMLInputElement)?.value?.trim() || "";
      const dsFWp = (document.getElementById("ds-fw") as HTMLInputElement)?.value?.trim() || "";
      const dsiB9 = (document.getElementById("dsi-bios9") as HTMLInputElement)?.value?.trim() || "";
      const dsiB7 = (document.getElementById("dsi-bios7") as HTMLInputElement)?.value?.trim() || "";
      const dsiFWp = (document.getElementById("dsi-fw") as HTMLInputElement)?.value?.trim() || "";
      const dsiNANDp =
        (document.getElementById("dsi-nand") as HTMLInputElement)?.value?.trim() || "";
      async function buildDiffPatch(
        dir: string,
        sectionKey: string,
        fields: Record<string, string>
      ): Promise<Record<string, Record<string, string>> | null> {
        if (!dir) return null;
        const ensured = await api.melondsEnsureConfig(dir);
        if (!ensured?.ok) return null;
        let cur: any = {};
        try {
          const res = await api.melondsRead(dir);
          if (res?.ok) cur = res.data?.[sectionKey] || res.data?.[sectionKey.toLowerCase()] || {};
        } catch {}
        const sec: Record<string, string> = {};
        for (const [k, v] of Object.entries(fields)) {
          const val = (v || "").trim();
          if (!val) continue;
          const curVal = String(cur[k] ?? cur[k?.toLowerCase?.()] ?? "").replace(/^"|"$/g, "");
          if (val !== curVal) sec[k] = val;
        }
        return Object.keys(sec).length ? { [sectionKey]: sec } : null;
      }

      if (dsDir) {
        const patchDS = await buildDiffPatch(dsDir, "DS", {
          BIOS9Path: dsB9,
          BIOS7Path: dsB7,
          FirmwarePath: dsFWp,
        });
        if (patchDS) {
          try {
            console.log("[ipc][ui] melonds:write DS", { dir: dsDir, patch: patchDS });
          } catch {}
          const w = await api.melondsWrite(dsDir, patchDS);
          if (!w?.ok) throw new Error(w?.error || "Failed to write melonDS DS config");
        }
      }
      if (dsiDir) {
        const patchDSi = await buildDiffPatch(dsiDir, "DSi", {
          BIOS9Path: dsiB9,
          BIOS7Path: dsiB7,
          FirmwarePath: dsiFWp,
          NANDPath: dsiNANDp,
        });
        if (patchDSi) {
          try {
            console.log("[ipc][ui] melonds:write DSi", { dir: dsiDir, patch: patchDSi });
          } catch {}
          const w2 = await api.melondsWrite(dsiDir, patchDSi);
          if (!w2?.ok) throw new Error(w2?.error || "Failed to write melonDS DSi config");
        }
      }

      const res = await api.saveSettings(current);
      if (!res?.ok) throw new Error(res?.error || "Save failed");
      closeSettings();
      document.dispatchEvent(new CustomEvent("settings:updated"));
    } catch (e: any) {
      playError();
      setError(errBox, String(e?.message || e));
    }
  });

  footer.appendChild(btnCancel);
  footer.appendChild(btnSave);

  const panels = document.createElement("div");
  panels.className = "panels";
  const panelAudio = document.createElement("div");
  panelAudio.className = "panel active";
  panelAudio.id = "panel-audio";
  panelAudio.setAttribute("role", "tabpanel");
  panelAudio.setAttribute("aria-labelledby", "tab-audio");
  panelAudio.appendChild(secAudio);
  const panelGen = document.createElement("div");
  panelGen.className = "panel";
  panelGen.id = "panel-gen";
  panelGen.setAttribute("role", "tabpanel");
  panelGen.setAttribute("aria-labelledby", "tab-gen");
  panelGen.hidden = true;
  panelGen.appendChild(secGen);
  const panelEmu = document.createElement("div");
  panelEmu.className = "panel";
  panelEmu.id = "panel-emu";
  panelEmu.setAttribute("role", "tabpanel");
  panelEmu.setAttribute("aria-labelledby", "tab-emu");
  panelEmu.hidden = true;
  panelEmu.appendChild(secEmu);
  const panelDisp = document.createElement("div");
  panelDisp.className = "panel";
  panelDisp.id = "panel-disp";
  panelDisp.setAttribute("role", "tabpanel");
  panelDisp.setAttribute("aria-labelledby", "tab-disp");
  panelDisp.hidden = true;
  panelDisp.appendChild(secDisp);

  const panelsMap: Record<string, HTMLElement> = {
    audio: panelAudio,
    gen: panelGen,
    emu: panelEmu,
    disp: panelDisp,
  };
  function activateTab(id: string, focus = true): void {
    allTabs.forEach((tb) => {
      const isTarget = tb.dataset.tab === id;
      tb.classList.toggle("active", isTarget);
      tb.setAttribute("aria-selected", isTarget ? "true" : "false");
      tb.setAttribute("tabindex", isTarget ? "0" : "-1");
      if (isTarget && focus) tb.focus();
    });
    Object.entries(panelsMap).forEach(([key, panel]) => {
      const isActive = key === id;
      if (isActive) {
        panel.hidden = false;
        panel.classList.add("animating-in");
        panel.classList.add("active");
        panel.addEventListener(
          "animationend",
          () => {
            panel.classList.remove("animating-in");
          },
          { once: true }
        );
      } else {
        panel.classList.remove("active");
        panel.classList.remove("animating-in");
        panel.hidden = true;
      }
    });
  }

  tabs.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(".nav-item");
    if (!t) return;
    playClick();
    activateTab(t.dataset.tab as string);
  });

  tabs.addEventListener("keydown", (e) => {
    const index = allTabs.findIndex((t) => t.getAttribute("tabindex") === "0");
    if (index < 0) return;
    let next = index;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = Math.min(allTabs.length - 1, index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = Math.max(0, index - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = allTabs.length - 1;
        break;
      case "Enter":
      case " ":
        activateTab(allTabs[index].dataset.tab as string, false);
        e.preventDefault();
        return;
      default:
        return;
    }
    allTabs.forEach((t, i) => t.setAttribute("tabindex", i === next ? "0" : "-1"));
    allTabs[next].focus();
    e.preventDefault();
  });

  modal.appendChild(header);
  const split = document.createElement("div");
  split.className = "settings-split";
  split.appendChild(tabs);
  split.appendChild(body);
  modal.appendChild(split);
  body.appendChild(panelAudio);
  body.appendChild(panelGen);
  body.appendChild(panelEmu);
  body.appendChild(panelDisp);
  modal.appendChild(errBox);
  modal.appendChild(footer);

  ov.appendChild(modal);
  document.body.classList.add("modal-open");

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSettings();
    }
  };
  document.addEventListener("keydown", onEsc, { once: true });

  tabAudio.focus();
}

export function closeSettings(): void {
  const ov = document.getElementById("overlay");
  if (!ov) return;
  const modal = ov.querySelector<HTMLElement>(".modal");
  if (modal) {
    modal.classList.remove("modal-enter");
    modal.classList.add("modal-exit");
    modal.addEventListener(
      "animationend",
      () => {
        ov.style.display = "none";
        ov.innerHTML = "";
        ov.classList.remove("show");
        document.body.classList.remove("modal-open");
      },
      { once: true }
    );
  } else {
    ov.style.display = "none";
    ov.innerHTML = "";
    ov.classList.remove("show");
    document.body.classList.remove("modal-open");
  }
}

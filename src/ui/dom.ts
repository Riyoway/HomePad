export function updateClock(now: Date = new Date()): void {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mon = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  document.getElementById("clock-text")?.replaceChildren(`${hh}:${mm}`);
  document.getElementById("date-text")?.replaceChildren(`${yyyy}/${mon}/${dd}`);
}

export function setBatteryPercent01(p: number): void {
  const text = document.getElementById("battery-text");
  const rect = document.getElementById("battery-level");
  if (typeof p === "number" && isFinite(p)) {
    if (text) text.textContent = Math.round(p * 100) + "%";
    const w = Math.max(1, Math.round(14 * Math.max(0, Math.min(1, p))));
    rect?.setAttribute("width", String(w));
  }
}

export function setBatteryPercent100(percent: number | null): void {
  const text = document.getElementById("battery-text");
  if (typeof percent === "number") {
    if (text) text.textContent = `${Math.round(percent)}%`;
    setBatteryPercent01(percent / 100);
  } else if (text) {
    text.textContent = "--%";
  }
}

export function setWifiBars(bars: number): void {
  const n = Math.max(0, Math.min(4, bars || 0));
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`wifi-bar-${i}`);
    if (el) el.setAttribute("class", `bar${i <= n ? " bar on" : " bar"}`);
  }
}

export function setNetworkText(text: string): void {
  const el = document.getElementById("network-text");
  if (el) el.textContent = text;
}

export function setVolume(level: number | null, muted: boolean): void {
  const volText = document.getElementById("volume-text");
  const w1 = document.getElementById("vol-wave-1");
  const w2 = document.getElementById("vol-wave-2");
  const w3 = document.getElementById("vol-wave-3");
  const isNum = typeof level === "number" && isFinite(level);
  const clamped = isNum ? Math.max(0, Math.min(100, level as number)) : 0;
  if (isNum && volText) volText.textContent = `${clamped}%`;
  const waves = muted || clamped === 0 ? 0 : clamped <= 33 ? 1 : clamped <= 66 ? 2 : 3;
  if (w1) w1.style.opacity = waves >= 1 ? "1" : "0.2";
  if (w2) w2.style.opacity = waves >= 2 ? "1" : "0.2";
  if (w3) w3.style.opacity = waves >= 3 ? "1" : "0.2";
}

export type DropdownOption = string | { value: string; label: string };

export interface Dropdown extends HTMLDivElement {
  value: string;
  disabled: boolean;
  setOptions(list: DropdownOption[]): void;
}

export function makeDropdown(placeholder = "Select emulator…"): Dropdown {
  const root = document.createElement("div") as Dropdown;
  root.className = "dropdown";
  root.setAttribute("role", "combobox");
  root.setAttribute("aria-expanded", "false");
  root.setAttribute("aria-haspopup", "listbox");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dropdown-toggle select";
  btn.title = placeholder;
  btn.setAttribute("aria-label", placeholder);
  const label = document.createElement("span");
  label.className = "dropdown-label";
  label.textContent = placeholder;
  const caret = document.createElement("span");
  caret.className = "dropdown-caret";
  btn.appendChild(label);
  btn.appendChild(caret);

  const menu = document.createElement("div");
  menu.className = "dropdown-menu";
  menu.setAttribute("role", "listbox");

  root.appendChild(btn);
  root.appendChild(menu);

  let _value = "";
  let _disabled = false;
  let _options: { value: string; label: string }[] = [];

  function renderOptions() {
    menu.innerHTML = "";
    _options.forEach(({ value, label: text }) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dropdown-item";
      item.setAttribute("role", "option");
      item.dataset.value = value;
      item.textContent = text;
      if (value === _value) item.setAttribute("aria-selected", "true");
      item.addEventListener("click", () => {
        if (_disabled) return;
        _value = value;
        label.textContent = text;
        root.classList.remove("placeholder");
        menu
          .querySelectorAll('.dropdown-item[aria-selected="true"]')
          .forEach((el) => el.removeAttribute("aria-selected"));
        item.setAttribute("aria-selected", "true");
        closeMenu();
        root.dispatchEvent(new Event("change"));
      });
      menu.appendChild(item);
    });
  }

  function openMenu() {
    if (_disabled) return;
    root.classList.add("open");
    root.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    root.classList.remove("open");
    root.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", () => {
    if (_disabled) return;
    if (root.classList.contains("open")) closeMenu();
    else openMenu();
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target as Node)) closeMenu();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && !root.classList.contains("open")) {
      e.preventDefault();
      openMenu();
    }
  });

  Object.defineProperty(root, "value", {
    get() {
      return _value;
    },
    set(v: string) {
      const found = _options.find((o) => o.value === v);
      _value = v || "";
      if (found) {
        label.textContent = found.label;
        root.classList.remove("placeholder");
      } else {
        label.textContent = placeholder;
        root.classList.add("placeholder");
      }
    },
  });
  Object.defineProperty(root, "disabled", {
    get() {
      return _disabled;
    },
    set(d: boolean) {
      _disabled = !!d;
      btn.disabled = _disabled;
      root.classList.toggle("is-disabled", _disabled);
    },
  });
  root.setOptions = (list: DropdownOption[]) => {
    _options = (list || []).map((v) => (typeof v === "string" ? { value: v, label: v } : v));
    renderOptions();
  };

  root.classList.add("placeholder");
  return root;
}

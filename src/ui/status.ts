import { api } from "../api";
import {
  updateClock,
  setBatteryPercent01,
  setBatteryPercent100,
  setWifiBars,
  setNetworkText,
  setVolume,
} from "./dom";

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

export function setupStatus(): void {
  setupClock();
  setupBattery();
  setupNetwork();
  setupSysStatus();
}

function setupClock(): void {
  setInterval(() => updateClock(new Date()), 1000);
  updateClock(new Date());
}

function setupBattery(): void {
  const batteryText = document.getElementById("battery-text");
  const getBattery = (navigator as any).getBattery as
    | (() => Promise<BatteryManagerLike>)
    | undefined;

  if (getBattery) {
    getBattery
      .call(navigator)
      .then((battery: BatteryManagerLike) => {
        setBatteryPercent01(battery.level);
        battery.addEventListener("levelchange", () => setBatteryPercent01(battery.level));
      })
      .catch(() => {
        if (batteryText) batteryText.textContent = "--%";
      });
  }

  api.onPowerState(({ onBattery }) => {
    if (!getBattery && batteryText) batteryText.textContent = onBattery ? "BAT" : "AC";
  });
}

function setupNetwork(): void {
  const apply = () => {
    const online = api.getOnlineStatus();
    setNetworkText(online ? "Online" : "Offline");
    setWifiBars(online ? 4 : 0);
  };
  apply();
  api.onOnlineChange(apply);
}

function setupSysStatus(): void {
  api.onSysStatus((state) => {
    if (state.time) {
      const now = new Date();
      now.setFullYear(
        state.time.year,
        (state.time.month || 1) - 1,
        state.time.day || now.getDate(),
      );
      now.setHours(state.time.hours || 0, state.time.minutes || 0, 0, 0);
      updateClock(now);
    }

    if (state.battery) {
      if (typeof state.battery.percent === "number") {
        setBatteryPercent100(state.battery.percent);
      }
    }

    if (state.wifi) {
      const bars = Math.max(0, Math.min(4, state.wifi.bars || 0));
      setWifiBars(bars);
      const online = api.getOnlineStatus();
      if (state.wifi.quality != null) {
        setNetworkText(`${Math.round(state.wifi.quality)}%`);
      } else {
        setNetworkText(online ? "Online" : "Offline");
        setWifiBars(online ? 4 : 0);
      }
    }

    if (state.volume) {
      setVolume(state.volume.level, !!state.volume.muted);
    }
  });
}

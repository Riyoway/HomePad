import type { Settings } from "../types";

export const ICON_VARIANTS: Record<string, { white: string; black: string }> = {
  "Nintendo DS": { white: "/assets/DS_White.png", black: "/assets/DS_black.png" },
  "Nintendo DSi": { white: "/assets/DSi_white.png", black: "/assets/DSi_black.png" },
  "Nintendo 3DS": { white: "/assets/3DS_white.png", black: "/assets/3DS_black.png" },
  "Nintendo Wii": { white: "/assets/Wii_white.png", black: "/assets/Wii_black.png" },
  "Nintendo Wii U": { white: "/assets/WiiU_white.png", black: "/assets/WiiU_black.png" },
};

export function getIconPath(systemName: string, defaultPath: string, settings: Settings): string {
  const variants = ICON_VARIANTS[systemName];
  if (!variants) {
    return defaultPath;
  }

  const iconColor = settings?.display?.iconColor || "white";
  if (iconColor === "white") {
    return variants.white;
  }
  if (iconColor === "black") {
    return variants.black;
  }
  if (iconColor === "custom") {
    const customColor = settings?.display?.iconCustomColor?.[systemName] || "white";
    return customColor === "black" ? variants.black : variants.white;
  }

  return defaultPath;
}

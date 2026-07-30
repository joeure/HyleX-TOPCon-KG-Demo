import type { Locale, PortalMode, ThemeMode } from "./modes";

export type PortalPreferences = { mode: PortalMode; locale: Locale; theme: ThemeMode };
const KEY = "inspector-portal-preferences-v1";
const fallback: PortalPreferences = { mode: "universe", locale: "zh-CN", theme: "dark" };

export function readPreferences(): PortalPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PortalPreferences> | null;
    const rawMode = parsed?.mode as string | undefined;
    const mode = rawMode === "ask" || rawMode === "ask-decide" ? "query" : rawMode === "workbench" ? "universe" : rawMode;
    return { ...fallback, ...parsed, ...(mode ? { mode } : {}) } as PortalPreferences;
  } catch { return fallback; }
}

export function writePreferences(value: PortalPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage is optional in prototype */ }
}

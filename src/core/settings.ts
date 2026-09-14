import type { OutputId } from "./protocol";
import type { Speed } from "./rules";

export type Settings = {
  speed: Speed;
  idleRounds: number;
  defaultCount: number;
  filenameTemplate: string;
  defaultOutput: OutputId;
  htmlTheme: "dark" | "light";
  panelCollapsed: boolean;
  panelPosition?: { x: number; y: number };
};

export const DEFAULT_SETTINGS: Settings = {
  speed: "normal",
  idleRounds: 6,
  defaultCount: 500,
  filenameTemplate: "{name}-{id}-{stamp}.{ext}",
  defaultOutput: "json",
  htmlTheme: "dark",
  panelCollapsed: false,
};

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.sync.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(got[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "sync" || !changes[KEY]) return;
    fn({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

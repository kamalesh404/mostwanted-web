import type { SaveData, UpgradeState } from './types';

const KEY = 'mw-web-save-v1';

export function defaultSave(): SaveData {
  return {
    cash: 1500,
    wins: 0,
    blacklist: 0, // bosses defeated
    owned: ['rion', 'sportster'],
    upgrades: { rion: upg(), sportster: upg() },
    selected: 'sportster',
    escapes: 0,
    bestSpeed: 0,
    muted: false,
  };
}

function upg(): UpgradeState { return { engine: 0, handling: 0, nitrous: 0 }; }

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw) as SaveData;
    const base = defaultSave();
    // ensure shape safety
    for (const id of data.owned) if (!data.upgrades[id]) data.upgrades[id] = upg();
    return { ...base, ...data };
  } catch {
    return defaultSave();
  }
}

export function persist(save: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

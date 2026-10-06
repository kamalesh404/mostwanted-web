import { RIVALS, type RivalDef, type SaveData } from './types';

/** The rival you must beat next (ladder runs 15 → 1 in MW05; here 5 → 1). */
export function currentRival(save: SaveData): RivalDef | null {
  if (save.blacklist >= RIVALS.length) return null;
  return RIVALS[save.blacklist];
}

/** Wins needed to unlock a challenge against the current rival. */
export function challengeRequirement(save: SaveData): number {
  return (save.blacklist + 1) * 2;
}

export function canChallenge(save: SaveData): boolean {
  return save.wins >= challengeRequirement(save);
}

/** Apply rewards after beating the current rival. Returns the rival beaten. */
export function beatRival(save: SaveData): RivalDef | null {
  const rival = currentRival(save);
  if (!rival) return null;
  save.cash += rival.reward;
  if (!save.owned.includes(rival.carReward)) {
    save.owned.push(rival.carReward);
    save.upgrades[rival.carReward] = { engine: 0, handling: 0, nitrous: 0 };
  }
  save.blacklist++;
  save.wins++;
  return rival;
}

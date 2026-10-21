import { createStore, del, get, set, values } from "idb-keyval";
import { seedScore } from "./seed";
import type { Score } from "./types";

// Parts live only on this device, in IndexedDB database "notnaya-tetrad", store "scores",
// keyed by score id. Keep this layout: changing it would lose the parts already saved.

const scores = createStore("notnaya-tetrad", "scores");
const SEEDED_KEY = "nt.seeded";

export async function listScores() {
  return (await values<Score>(scores))
    .filter((s) => s && s.schemaVersion === 1)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getScore(id: string) {
  return get<Score>(id, scores);
}

export function saveScore(score: Score) {
  return set(score.id, score, scores);
}

export function deleteScore(id: string) {
  return del(id, scores);
}

/** Adds the example part on the very first launch. */
export async function seedOnce() {
  if (prefs.get(SEEDED_KEY)) return;
  if ((await values(scores)).length === 0) await saveScore(seedScore());
  prefs.set(SEEDED_KEY, "1");
}

/** Asks the browser not to evict the data under storage pressure. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

export async function exportBackup() {
  const backup = { app: "notnaya-tetrad", version: 1, exportedAt: new Date().toISOString(), scores: await listScores() };
  return new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
}

/** Restores parts from a backup file; keeps a part on the phone if it was edited later. */
export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (data.app !== "notnaya-tetrad" || !Array.isArray(data.scores)) throw new Error("not-a-backup");
  let restored = 0;
  for (const s of data.scores as Score[]) {
    if (!s || s.schemaVersion !== 1 || !s.id || !Array.isArray(s.measures)) continue;
    const existing = await getScore(s.id);
    if (!existing || existing.updatedAt < s.updatedAt) {
      await saveScore(s);
      restored++;
    }
  }
  return restored;
}

/** localStorage that never throws (private mode, blocked storage). */
export const prefs = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

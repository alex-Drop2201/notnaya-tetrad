import type { Base, Pitch, Score } from "./types";

// Example part shown on first launch, so the library isn't empty.

const PITCHES: Record<string, Pitch> = {
  G3: { step: 4, octave: 3, alter: 0 },
  A3: { step: 5, octave: 3, alter: 0 },
  D4: { step: 1, octave: 4, alter: 0 },
  E4: { step: 2, octave: 4, alter: 0 },
  "F#4": { step: 3, octave: 4, alter: 1 },
  A4: { step: 5, octave: 4, alter: 0 },
};

const MEASURES: [string, Base][][] = [
  [["A4", 2], ["A4", 2]],
  [["D4", 2], ["A4", 2]],
  [["E4", 2], ["A4", 2]],
  [["F#4", 2], ["E4", 2]],
  [["A4", 2], ["A4", 2]],
  [["D4", 2], ["A4", 2]],
  [["G3", 2], ["A3", 2]],
  [["G3", 2], ["A3", 2]],
  [["G3", 2], ["A3", 2]],
  [["D4", 2], ["D4", 2]],
  [["D4", 2], ["D4", 2]],
  [["D4", 1]],
];

const SEED_ID = "seed-fed";

export function seedScore(): Score {
  return {
    schemaVersion: 1,
    id: SEED_ID,
    title: "Fed",
    composer: "",
    arranger: "",
    partName: "Скрипка",
    tempo: 80,
    keyFifths: 2,
    time: { beats: 4, beatType: 4 },
    measures: MEASURES.map((events, m) => ({
      id: `seed-fed-m${m + 1}`,
      events: events.map(([name, base], e) => ({
        id: `seed-fed-m${m + 1}-e${e + 1}`,
        rest: false,
        base,
        dots: 0,
        pitch: { ...PITCHES[name] },
      })),
    })),
    createdAt: "2026-10-18T20:22:00.000Z",
    updatedAt: "2026-10-18T20:50:00.000Z",
  };
}

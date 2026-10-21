import type { Alter, Pitch } from "./types";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SOLFEGE = ["до", "ре", "ми", "фа", "соль", "ля", "си"];
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
/** Steps that get a sharp, in key-signature order: F C G D A E B. */
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
/** Steps that get a flat, in key-signature order: B E A D G C F. */
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

/** VexFlow key-signature spec per number of fifths. */
export const KEY_SPECS: Record<number, string> = {
  [-7]: "Cb",
  [-6]: "Gb",
  [-5]: "Db",
  [-4]: "Ab",
  [-3]: "Eb",
  [-2]: "Bb",
  [-1]: "F",
  0: "C",
  1: "G",
  2: "D",
  3: "A",
  4: "E",
  5: "B",
  6: "F#",
  7: "C#",
};

const KEY_TITLES: Record<number, string> = {
  [-7]: "до-бемоль мажор",
  [-6]: "соль-бемоль мажор",
  [-5]: "ре-бемоль мажор",
  [-4]: "ля-бемоль мажор",
  [-3]: "ми-бемоль мажор",
  [-2]: "си-бемоль мажор",
  [-1]: "фа мажор",
  0: "до мажор",
  1: "соль мажор",
  2: "ре мажор",
  3: "ля мажор",
  4: "ми мажор",
  5: "си мажор",
  6: "фа-диез мажор",
  7: "до-диез мажор",
};

export function keyTitle(fifths: number) {
  return KEY_TITLES[fifths] ?? "";
}

/** Alteration the key signature gives to a step. */
export function keyAlter(fifths: number, step: number): Alter {
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(step)) return 1;
  if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(step)) return -1;
  return 0;
}

export function midiOf(p: Pitch) {
  return 12 * (p.octave + 1) + SEMITONES[p.step] + p.alter;
}

/** Position on the staff, counted in diatonic steps. */
export function diatonicOf(p: Pitch) {
  return p.octave * 7 + p.step;
}

export function fromDiatonic(diatonic: number, fifths: number): Pitch {
  const step = ((diatonic % 7) + 7) % 7;
  return { step, octave: Math.floor(diatonic / 7), alter: keyAlter(fifths, step) };
}

/** Spelling for a piano key: sharps in sharp keys and C major, flats in flat keys. */
export function fromMidi(midi: number, fifths: number): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const natural = SEMITONES.indexOf(pc);
  let p: Pitch;
  if (natural >= 0) p = { step: natural, octave, alter: 0 };
  else if (fifths < 0)
    p = { step: SEMITONES.indexOf((pc + 1) % 12), octave: pc === 11 ? octave + 1 : octave, alter: -1 };
  else p = { step: SEMITONES.indexOf(pc - 1), octave, alter: 1 };
  p.explicit = p.alter !== keyAlter(fifths, p.step);
  return p;
}

export function vexKey(p: Pitch) {
  return `${LETTERS[p.step].toLowerCase()}/${p.octave}`;
}

const OCTAVE_MARKS: Record<number, string> = { 4: "¹", 5: "²", 6: "³", 7: "⁴" };
const ALTER_SIGNS: Record<Alter, string> = { [-1]: "♭", 0: "", 1: "♯" };

/** Russian name with octave mark, e.g. «ля¹». */
export function pitchLabel(p: Pitch) {
  return `${SOLFEGE[p.step]}${ALTER_SIGNS[p.alter]}${OCTAVE_MARKS[p.octave] ?? ""}`;
}

export function stepName(step: number) {
  return SOLFEGE[step];
}

export function samePitch(a?: Pitch, b?: Pitch) {
  return !!a && !!b && midiOf(a) === midiOf(b);
}

export const RANGE_ERRORS = {
  low: "Скрипка звучит от соль малой октавы",
  high: "Скрипка звучит до ми четвёртой октавы",
};

/** Violin range is G3 (55) to E7 (100). */
export function rangeError(p: Pitch) {
  const midi = midiOf(p);
  return midi < 55 ? RANGE_ERRORS.low : midi > 100 ? RANGE_ERRORS.high : null;
}

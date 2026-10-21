import type { Base, Dots, NoteEvent, TimeSignature } from "./types";

// Durations are counted in sixteenths ("units"): a quarter is 4, a dotted half is 12.

export function baseUnits(base: Base) {
  return 16 / base;
}

export function durationUnits(base: Base, dots: Dots | boolean) {
  return baseUnits(base) * (dots ? 1.5 : 1);
}

export function measureUnits(time: TimeSignature) {
  return time.beats * (16 / time.beatType);
}

export function eventUnits(event: NoteEvent, unitsPerMeasure: number) {
  return event.full ? unitsPerMeasure : durationUnits(event.base, event.dots);
}

interface Duration {
  base: Base;
  dots: Dots;
  units: number;
}

const DURATIONS: Duration[] = [
  { base: 1, dots: 0, units: 16 },
  { base: 2, dots: 1, units: 12 },
  { base: 2, dots: 0, units: 8 },
  { base: 4, dots: 1, units: 6 },
  { base: 4, dots: 0, units: 4 },
  { base: 8, dots: 1, units: 3 },
  { base: 8, dots: 0, units: 2 },
  { base: 16, dots: 0, units: 1 },
];

/** Longest-first split of a length into note values, for notes tied across a barline. */
export function splitUnits(units: number) {
  const parts: Duration[] = [];
  let left = units;
  while (left > 0) {
    const d = DURATIONS.find((d) => d.units <= left)!;
    parts.push(d);
    left -= d.units;
  }
  return parts;
}

/** 6/8, 9/8, 12/8: beats are dotted quarters. */
function isCompound(time: TimeSignature) {
  return time.beatType === 8 && time.beats % 3 === 0 && time.beats > 3;
}

/** Split of a rest that starts at `offset` so each piece sits on the beat grid. */
export function restDurations(units: number, offset: number, time: TimeSignature) {
  const compound = isCompound(time);
  const parts: Duration[] = [];
  let left = units;
  let at = offset;
  while (left > 0) {
    const d =
      DURATIONS.find((d) => {
        if (d.units > left) return false;
        if (d.dots) return compound && d.units === 6 && at % 6 === 0;
        if (compound && (at % 6) + d.units > 6) return false;
        return at % d.units === 0;
      }) ?? DURATIONS[DURATIONS.length - 1];
    parts.push(d);
    left -= d.units;
    at += d.units;
  }
  return parts;
}

export const DURATION_NAMES: Record<Base, string> = {
  1: "Целая",
  2: "Половинная",
  4: "Четверть",
  8: "Восьмая",
  16: "Шестнадцатая",
};

/** VexFlow duration code. */
export function vexDuration(base: Base) {
  return base === 1 ? "w" : base === 2 ? "h" : base === 4 ? "q" : String(base);
}

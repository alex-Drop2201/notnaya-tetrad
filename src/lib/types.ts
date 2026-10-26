// Data model of a violin part. Scores are stored as-is in IndexedDB and in backup
// files, so any change here must stay backward compatible with schemaVersion 1.

/** Note value: 1 whole, 2 half, 4 quarter, 8 eighth, 16 sixteenth. */
export type Base = 1 | 2 | 4 | 8 | 16;
export type Dots = 0 | 1;
export type Alter = -1 | 0 | 1;

export interface Pitch {
  /** 0 = C … 6 = B. */
  step: number;
  /** Scientific octave: middle C is C4. */
  octave: number;
  alter: Alter;
  /** The accidental differs from the key signature and is chosen by hand. */
  explicit?: boolean;
}

export interface NoteEvent {
  id: string;
  rest: boolean;
  base: Base;
  dots: Dots;
  /** Whole-measure rest: lasts the full measure whatever the time signature. */
  full?: boolean;
  /** Rest the editor filled in by itself, as opposed to one the user entered. */
  auto?: boolean;
  pitch?: Pitch;
  /** Лига to the next event: a tie onto the same pitch, otherwise a slur (also to or from a rest). */
  tie?: boolean;
  /** Fingering: 0 (open string) to 4. */
  finger?: number;
}

export interface Measure {
  id: string;
  events: NoteEvent[];
  /** Added by the editor at the end of the part and still empty. */
  auto?: boolean;
  repeatStart?: true;
  repeatEnd?: true;
}

export interface TimeSignature {
  beats: number;
  beatType: number;
  symbol?: "common" | "cut";
}

/**
 * A second part written on a staff under the first one and played together with it
 * (двойная партия). It has as many measures as the first staff; repeat signs are those
 * of the first staff.
 */
export interface SecondStaff {
  /** Printed before the staff, like `Score.partName` for the first one. */
  name: string;
  measures: Measure[];
}

export interface Score {
  schemaVersion: 1;
  id: string;
  title: string;
  composer: string;
  arranger: string;
  partName: string;
  tempo: number;
  /** Key signature as a count of sharps (positive) or flats (negative). */
  keyFifths: number;
  time: TimeSignature;
  measures: Measure[];
  /** Added later, so parts saved before it simply don't have it. */
  second?: SecondStaff;
  createdAt: string;
  updatedAt: string;
}

/** 0 is the first (upper) staff, 1 the second. */
export type StaffIndex = 0 | 1;

/** Position of an event: measure index and event index inside it. */
export interface Cursor {
  m: number;
  e: number;
}

export interface EditResult {
  score: Score;
  cursor: Cursor;
  /** Event the edit wrote, for the flash highlight. */
  changed?: Cursor;
  /** Informational message shown under the staff. */
  notice?: string;
  /** The edit was refused; the score is unchanged. */
  error?: string;
}

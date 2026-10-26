import { durationUnits, eventUnits, measureUnits, restDurations, splitUnits } from "./durations";
import { diatonicOf, fromDiatonic, keyAlter, rangeError, samePitch } from "./pitch";
import type { Base, Cursor, Dots, EditResult, Measure, NoteEvent, Pitch, Score, StaffIndex, TimeSignature } from "./types";

// Every edit works on a copy of the score and returns a new one. The measure is a
// fixed-length timeline: writing a value overwrites whatever lies under it, fills the
// rest of the overwritten value with rests, and carries what doesn't fit into the next
// measure tied (a note) or continued (a rest).
//
// A score can have a second staff (`Score.second`). Edits write into `measures`; the
// second staff is edited through `staffView`, which swaps the staves, and the result
// goes back through `fromStaffView`. Measures are added, copied and removed on both
// staves at once, so they always have the same number of measures.

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

const NOTICES = {
  split: "Нота не поместилась в такт — разделили её лигой на два такта",
  restSplit: "Пауза не поместилась в такт — продолжили её в следующем",
  added: "Такт добавлен в обе партии",
  duplicated: "Такт повторён в обеих партиях",
  deleted: "Такт удалён из обеих партий",
  secondAdded: "Добавлена вторая партия. Нажмите на нужную строку, чтобы писать в неё",
};

const FIRST_NAME = "Скрипка";
const SECOND_NAMES = ["Скрипка 1", "Скрипка 2"];

export const ERRORS = {
  notANote: "Выберите ноту, а не паузу",
  nothingSelected: "Выберите ноту или паузу",
  tieEnd: "Дальше ничего нет — лигу не к чему вести",
  dotSixteenth: "Точку у шестнадцатой в этом редакторе не ставим",
};

export function fullRest(): NoteEvent {
  return { id: uid(), rest: true, base: 1, dots: 0, full: true, auto: true };
}

export function emptyMeasure(auto = false): Measure {
  return auto ? { id: uid(), events: [fullRest()], auto } : { id: uid(), events: [fullRest()] };
}

export interface NewScore {
  title: string;
  composer?: string;
  arranger?: string;
  tempo: number;
  keyFifths: number;
  time: TimeSignature;
  measures: number;
}

export function createScore(params: NewScore, now = new Date().toISOString()): Score {
  return {
    schemaVersion: 1,
    id: uid(),
    title: params.title.trim() || "Без названия",
    composer: params.composer?.trim() ?? "",
    arranger: params.arranger?.trim() ?? "",
    partName: "Скрипка",
    tempo: params.tempo,
    keyFifths: params.keyFifths,
    time: params.time,
    measures: Array.from({ length: Math.max(1, params.measures) }, () => emptyMeasure()),
    createdAt: now,
    updatedAt: now,
  };
}

export function eventAt(score: Score, at: Cursor): NoteEvent | undefined {
  return score.measures[at.m]?.events[at.e];
}

/** Empty time: a rest the editor filled in, or an empty measure. Shown as blank space in the editor. */
export function isEmpty(ev: NoteEvent | undefined) {
  return !ev || (ev.rest && (!!ev.auto || !!ev.full));
}

/** Start of the event at `index`, in units from the barline. */
function offsetOf(measure: Measure, index: number, unitsPerMeasure: number) {
  let off = 0;
  for (let i = 0; i < index && i < measure.events.length; i++) off += eventUnits(measure.events[i], unitsPerMeasure);
  return off;
}

/** Index of the event sounding at `offset`. */
function indexAt(measure: Measure, offset: number, unitsPerMeasure: number) {
  let off = 0;
  for (let i = 0; i < measure.events.length; i++) {
    const len = eventUnits(measure.events[i], unitsPerMeasure);
    if (offset < off + len) return i;
    off += len;
  }
  return Math.max(0, measure.events.length - 1);
}

export function clampCursor(score: Score, at: Cursor): Cursor {
  const m = Math.min(Math.max(0, at.m), score.measures.length - 1);
  return { m, e: Math.min(Math.max(0, at.e), score.measures[m].events.length - 1) };
}

export function nextCursor(score: Score, at: Cursor): Cursor | null {
  if (at.e + 1 < score.measures[at.m].events.length) return { m: at.m, e: at.e + 1 };
  if (at.m + 1 < score.measures.length) return { m: at.m + 1, e: 0 };
  return null;
}

export function prevCursor(score: Score, at: Cursor): Cursor | null {
  if (at.e > 0) return { m: at.m, e: at.e - 1 };
  if (at.m > 0) return { m: at.m - 1, e: score.measures[at.m - 1].events.length - 1 };
  return null;
}

function restEvent(base: Base, dots: Dots, auto: boolean): NoteEvent {
  return auto ? { id: uid(), rest: true, base, dots, auto: true } : { id: uid(), rest: true, base, dots };
}

/** What to write: a note or a rest of a given length. */
interface Item {
  rest: boolean;
  /** The user entered this rest, so it must not merge into filler rests. */
  userRest?: boolean;
  units: number;
  pitch?: Pitch;
  finger?: number;
  /** The event being rewritten had a tie or slur onward; keep it. */
  tieOut?: boolean;
}

/** Events for the part of an item that falls into one measure. */
function itemEvents(
  item: Item,
  units: number,
  offset: number,
  time: TimeSignature,
  continues: boolean,
  first: boolean,
): NoteEvent[] {
  if (item.rest) {
    const rests = restDurations(units, offset, time).map((d) => restEvent(d.base, d.dots, !item.userRest));
    if (item.tieOut && !continues) rests[rests.length - 1].tie = true;
    return rests;
  }
  const parts = splitUnits(units);
  return parts.map((d, i) => {
    const last = i === parts.length - 1;
    const ev: NoteEvent = { id: uid(), rest: false, base: d.base, dots: d.dots, pitch: { ...item.pitch! } };
    if (!last || continues || item.tieOut) ev.tie = true;
    if (first && i === 0 && item.finger != null) ev.finger = item.finger;
    return ev;
  });
}

/** Puts `inserted` over [offset, offset + units) and refills the overwritten tail with rests. */
function overwrite(
  events: NoteEvent[],
  offset: number,
  units: number,
  inserted: NoteEvent[],
  unitsPerMeasure: number,
  time: TimeSignature,
) {
  const end = offset + units;
  const before: NoteEvent[] = [];
  const after: NoteEvent[] = [];
  let tail: NoteEvent[] = [];
  let at = 0;
  for (const ev of events) {
    const start = at;
    const stop = at + eventUnits(ev, unitsPerMeasure);
    at = stop;
    if (stop <= offset) before.push(ev);
    else if (start >= end) after.push(ev);
    else if (stop > end) tail = restDurations(stop - end, end, time).map((d) => restEvent(d.base, d.dots, true));
  }
  return { events: [...before, ...inserted, ...tail, ...after], firstIndex: before.length };
}

/** Writes an item at the cursor, spilling into following measures (adding them if needed). */
function write(score: Score, at: Cursor, item: Item) {
  const next = structuredClone(score);
  const perMeasure = measureUnits(next.time);
  let m = at.m;
  let offset = offsetOf(next.measures[m], at.e, perMeasure);
  let left = item.units;
  let first: Cursor | null = null;
  let last = at;
  let split = false;
  while (left > 0) {
    if (m >= next.measures.length) next.measures.push(emptyMeasure());
    const measure = next.measures[m];
    const here = Math.min(left, perMeasure - offset);
    const continues = left - here > 0;
    const inserted = itemEvents(item, here, offset, next.time, continues, first === null);
    const result = overwrite(measure.events, offset, here, inserted, perMeasure, next.time);
    measure.events = result.events;
    first ||= { m, e: result.firstIndex };
    last = { m, e: result.firstIndex + inserted.length - 1 };
    left -= here;
    if (continues) {
      split = true;
      m += 1;
      offset = 0;
    }
  }
  return { score: next, first: first!, last, split };
}

/** Cursor after `at`, appending an empty measure at the end of the part. */
function advance(score: Score, at: Cursor): Cursor {
  const next = nextCursor(score, at);
  if (next) return next;
  score.measures.push(emptyMeasure(true));
  return { m: score.measures.length - 1, e: 0 };
}

/** Merges neighbouring filler rests and re-splits them on the beat grid. */
function mergeFillerRests(events: NoteEvent[], unitsPerMeasure: number, time: TimeSignature) {
  const out: NoteEvent[] = [];
  let at = 0;
  let runStart = -1;
  let runUnits = 0;
  const flush = () => {
    if (runUnits > 0) for (const d of restDurations(runUnits, runStart, time)) out.push(restEvent(d.base, d.dots, true));
    runStart = -1;
    runUnits = 0;
  };
  for (const ev of events) {
    const len = eventUnits(ev, unitsPerMeasure);
    if (ev.rest && ev.auto && !ev.full) {
      if (runStart < 0) runStart = at;
      runUnits += len;
    } else {
      flush();
      out.push(ev);
    }
    at += len;
  }
  flush();
  return out;
}

/**
 * A tie (same pitch) or slur (anything else, rests included) needs something written
 * after it: it is dropped before empty time and at the end. Rests carry no finger or pitch.
 */
function cleanTies(measures: Measure[]) {
  const all = measures.flatMap((m) => m.events);
  all.forEach((ev, i) => {
    if (ev.rest) {
      delete ev.finger;
      delete ev.pitch;
    }
    if (ev.tie && (isEmpty(ev) || isEmpty(all[i + 1]))) delete ev.tie;
  });
}

/** Measure lists of the score: the first staff, then the second if there is one. */
export function staffLists(score: Score): Measure[][] {
  return score.second ? [score.measures, score.second.measures] : [score.measures];
}

/** Gives the shorter staff empty measures at the end, so both have as many. */
function equalize(score: Score) {
  if (!score.second) return;
  const pad = (to: Measure[], from: Measure[]) => {
    while (to.length < from.length) to.push(emptyMeasure(!!from[to.length].auto));
  };
  pad(score.second.measures, score.measures);
  pad(score.measures, score.second.measures);
}

/** Tidies one staff: filler rests merged, an empty measure is one whole-measure rest, ties checked. */
function tidy(measures: Measure[], time: TimeSignature) {
  const perMeasure = measureUnits(time);
  for (const measure of measures) {
    measure.events = mergeFillerRests(measure.events, perMeasure, time);
    const empty = measure.events.every((ev) => ev.rest && (ev.auto || ev.full));
    if (empty && !(measure.events.length === 1 && measure.events[0].full)) measure.events = [fullRest()];
    if (!empty) delete measure.auto;
  }
  cleanTies(measures);
}

/** Tidies the score after an edit and maps cursors through the change by time offset. */
function normalize(score: Score, cursor: Cursor, extra: Partial<EditResult> = {}): EditResult {
  const perMeasure = measureUnits(score.time);
  const locate = (c: Cursor) => ({ m: c.m, off: offsetOf(score.measures[c.m], c.e, perMeasure) });
  const at = locate(cursor);
  const changed = extra.changed ? locate(extra.changed) : null;
  equalize(score);
  for (const measures of staffLists(score)) tidy(measures, score.time);
  score.updatedAt = new Date().toISOString();
  const resolve = (p: { m: number; off: number }) => {
    const m = Math.min(p.m, score.measures.length - 1);
    return { m, e: indexAt(score.measures[m], p.off, perMeasure) };
  };
  return { ...extra, score, cursor: resolve(at), changed: changed ? resolve(changed) : undefined };
}

export function enterNote(score: Score, at: Cursor, pitch: Pitch, base: Base, dots: boolean): EditResult {
  const error = rangeError(pitch);
  if (error) return { score, cursor: at, error };
  if (dots && base === 16) return { score, cursor: at, error: ERRORS.dotSixteenth };
  const w = write(score, at, { rest: false, units: durationUnits(base, dots), pitch });
  const next = advance(w.score, w.last);
  return normalize(w.score, next, { changed: w.first, notice: w.split ? NOTICES.split : undefined });
}

export function enterRest(score: Score, at: Cursor, base: Base, dots: boolean): EditResult {
  if (dots && base === 16) return { score, cursor: at, error: ERRORS.dotSixteenth };
  const w = write(score, at, { rest: true, userRest: true, units: durationUnits(base, dots) });
  const next = advance(w.score, w.last);
  return normalize(w.score, next, { changed: w.first, notice: w.split ? NOTICES.restSplit : undefined });
}

/** Changes the length of the selected note or rest, keeping its pitch, finger and tie. */
export function setDuration(score: Score, at: Cursor, base: Base, dots: boolean): EditResult {
  const ev = eventAt(score, at);
  if (!ev) return { score, cursor: at };
  if (dots && base === 16) return { score, cursor: at, error: ERRORS.dotSixteenth };
  const units = durationUnits(base, dots);
  const w = ev.rest
    ? write(score, at, { rest: true, userRest: true, units, tieOut: ev.tie })
    : write(score, at, { rest: false, units, pitch: ev.pitch, finger: ev.finger, tieOut: ev.tie });
  const notice = w.split ? (ev.rest ? NOTICES.restSplit : NOTICES.split) : undefined;
  return normalize(w.score, w.first, { changed: w.first, notice });
}

/** Turns the selected event into empty time of the same length. */
export function clearEvent(score: Score, at: Cursor): EditResult {
  const ev = eventAt(score, at);
  if (!ev || (ev.rest && ev.auto)) return { score, cursor: at };
  return normalize(write(score, at, { rest: true, units: eventUnits(ev, measureUnits(score.time)) }).score, at, {
    changed: at,
  });
}

/** Nearest written event at or before `at` (skipping empty time), or null. */
function writtenAtOrBefore(score: Score, at: Cursor | null): Cursor | null {
  let c = at;
  while (c && isEmpty(eventAt(score, c))) c = prevCursor(score, c);
  return c;
}

/** What Backspace would delete from here: the selected event, or the last one written before an empty slot. */
export function backspaceTarget(score: Score, at: Cursor) {
  return writtenAtOrBefore(score, at);
}

/**
 * Backspace, as in text: clears the event at the cursor (on an empty slot, the last
 * event written before it), leaves empty time in its place and moves to the event
 * before it. `after` tells the editor that the next note goes after that event.
 */
export function backspace(score: Score, at: Cursor): EditResult & { after: boolean } {
  const target = backspaceTarget(score, at);
  if (!target) return { score, cursor: at, after: false };
  const cleared = clearEvent(score, target);
  const previous = writtenAtOrBefore(cleared.score, prevCursor(cleared.score, cleared.cursor));
  return previous
    ? { ...cleared, cursor: previous, changed: undefined, after: true }
    : { ...cleared, changed: undefined, after: false };
}

/** Where the next note goes when the caret is after the event at `at`. Adds a measure at the end. */
export function slotAfter(score: Score, at: Cursor): { score: Score; at: Cursor } {
  const next = nextCursor(score, at);
  if (next) return { score, at: next };
  const grown = structuredClone(score);
  grown.measures.push(emptyMeasure(true));
  return { score: grown, at: { m: grown.measures.length - 1, e: 0 } };
}

/** Applies `edit` to the selected note; `edit` returns an error message to refuse. */
function editNote(score: Score, at: Cursor, edit: (ev: NoteEvent, score: Score) => string | null | void): EditResult {
  const ev = eventAt(score, at);
  if (!ev) return { score, cursor: at };
  if (ev.rest) return { score, cursor: at, error: ERRORS.notANote };
  return editEvent(score, at, edit);
}

function editEvent(score: Score, at: Cursor, edit: (ev: NoteEvent, score: Score) => string | null | void): EditResult {
  const next = structuredClone(score);
  const error = edit(next.measures[at.m].events[at.e], next);
  return error ? { score, cursor: at, error } : normalize(next, at, { changed: at });
}

export function setPitch(score: Score, at: Cursor, pitch: Pitch) {
  return editNote(score, at, (ev) => {
    const error = rangeError(pitch);
    if (error) return error;
    ev.pitch = { ...pitch };
  });
}

/** Moves the note up or down by `steps` staff positions, following the key signature. */
export function shiftPitch(score: Score, at: Cursor, steps: number) {
  return editNote(score, at, (ev, s) => {
    const pitch = fromDiatonic(diatonicOf(ev.pitch!) + steps, s.keyFifths);
    const error = rangeError(pitch);
    if (error) return error;
    ev.pitch = pitch;
  });
}

/** Sets an accidental; pressing the same explicit one again returns to the key signature. */
export function setAccidental(score: Score, at: Cursor, alter: -1 | 0 | 1) {
  return editNote(score, at, (ev, s) => {
    const p = ev.pitch!;
    const inKey = keyAlter(s.keyFifths, p.step);
    const next = p.alter === alter && p.explicit ? inKey : alter;
    const pitch: Pitch = { ...p, alter: next, explicit: next !== inKey };
    const error = rangeError(pitch);
    if (error) return error;
    ev.pitch = pitch;
  });
}

/** Sets the finger; the same finger again, or null, removes it. */
export function setFinger(score: Score, at: Cursor, finger: number | null) {
  return editNote(score, at, (ev) => {
    if (finger === null || ev.finger === finger) delete ev.finger;
    else ev.finger = finger;
  });
}

/**
 * Puts a лига from the selected note or rest to the next event, or removes it. Onto the
 * same pitch it is a tie (one long sound); onto another note or a rest it is a slur.
 * From a note into empty time, the note is continued there and tied.
 */
export function toggleTie(score: Score, at: Cursor): EditResult {
  const ev = eventAt(score, at);
  if (!ev) return { score, cursor: at };
  if (isEmpty(ev)) return { score, cursor: at, error: ERRORS.nothingSelected };
  if (ev.tie) return editEvent(score, at, (e) => void delete e.tie);
  const nextAt = nextCursor(score, at);
  if (!nextAt) return { score, cursor: at, error: ERRORS.tieEnd };
  const next = eventAt(score, nextAt)!;
  if (!isEmpty(next)) return editEvent(score, at, (e) => void (e.tie = true));
  if (ev.rest) return { score, cursor: at, error: ERRORS.tieEnd };
  const w = write(score, nextAt, { rest: false, units: eventUnits(next, measureUnits(score.time)), pitch: ev.pitch });
  w.score.measures[at.m].events[at.e].tie = true;
  return normalize(w.score, at, { changed: at });
}

/**
 * Edits the measure list. Adding, copying and removing measures is done on both staves:
 * a measure is a measure of the whole score. `notice` is shown when there are two staves.
 */
function editMeasures(score: Score, edit: (measures: Measure[]) => Cursor, both?: { notice: string }) {
  const next = structuredClone(score);
  const at = edit(next.measures);
  if (both && next.second) edit(next.second.measures);
  return normalize(next, clampCursor(next, at), { changed: at, notice: both && next.second ? both.notice : undefined });
}

export function insertMeasure(score: Score, at: Cursor) {
  return editMeasures(
    score,
    (ms) => {
      ms.splice(at.m + 1, 0, emptyMeasure());
      return { m: at.m + 1, e: 0 };
    },
    { notice: NOTICES.added },
  );
}

export function duplicateMeasure(score: Score, at: Cursor) {
  return editMeasures(
    score,
    (ms) => {
      const copy = structuredClone(ms[at.m]);
      copy.id = uid();
      delete copy.auto;
      copy.events.forEach((ev) => (ev.id = uid()));
      ms.splice(at.m + 1, 0, copy);
      return { m: at.m + 1, e: 0 };
    },
    { notice: NOTICES.duplicated },
  );
}

export function deleteMeasure(score: Score, at: Cursor) {
  return editMeasures(
    score,
    (ms) => {
      if (ms.length === 1) ms[0] = emptyMeasure();
      else ms.splice(at.m, 1);
      return { m: Math.min(at.m, ms.length - 1), e: 0 };
    },
    { notice: NOTICES.deleted },
  );
}

/** Repeat signs are the score's: they are kept on `measures` only (see `swapStaves`). */
export function toggleRepeat(score: Score, at: Cursor, side: "start" | "end") {
  return editMeasures(score, (ms) => {
    const m = ms[at.m];
    if (side === "start") m.repeatStart = !m.repeatStart || undefined;
    else m.repeatEnd = !m.repeatEnd || undefined;
    return at;
  });
}

/**
 * The score with its staves swapped: the second staff in `measures`, under the first
 * staff's name, and the first one in `second`. Repeat signs stay on `measures`.
 * Swapping twice gives the score back.
 */
export function swapStaves(score: Score): Score {
  const second = score.second;
  if (!second) return score;
  const withRepeats = (measure: Measure, from: Measure | undefined): Measure => {
    const m = { ...measure };
    delete m.repeatStart;
    delete m.repeatEnd;
    if (from?.repeatStart) m.repeatStart = true;
    if (from?.repeatEnd) m.repeatEnd = true;
    return m;
  };
  return {
    ...score,
    partName: second.name,
    measures: second.measures.map((m, i) => withRepeats(m, score.measures[i])),
    second: { ...second, name: score.partName, measures: score.measures.map((m) => withRepeats(m, undefined)) },
  };
}

/** The score as edits of `staff` see it: that staff in `measures`. */
export function staffView(score: Score, staff: StaffIndex): Score {
  return staff === 1 && score.second ? swapStaves(score) : score;
}

/** Puts a score edited through `staffView(…, staff)` back in order. */
export function fromStaffView(view: Score, staff: StaffIndex): Score {
  return staff === 1 && view.second ? swapStaves(view) : view;
}

/** The staff has something written on it. */
export function hasMusic(measures: Measure[]) {
  return measures.some((m) => m.events.some((ev) => !isEmpty(ev)));
}

/** Adds an empty second staff under the first. */
export function addSecondStaff(score: Score, at: Cursor): EditResult {
  if (score.second) return { score, cursor: at };
  const next = structuredClone(score);
  next.second = { name: SECOND_NAMES[1], measures: next.measures.map((m) => emptyMeasure(!!m.auto)) };
  if (next.partName === FIRST_NAME) next.partName = SECOND_NAMES[0];
  next.updatedAt = new Date().toISOString();
  return { score: next, cursor: { m: at.m, e: 0 }, notice: NOTICES.secondAdded };
}

/** Removes the second staff and what is written on it. */
export function removeSecondStaff(score: Score, at: Cursor): EditResult {
  if (!score.second) return { score, cursor: at };
  const next = structuredClone(score);
  delete next.second;
  if (next.partName === SECOND_NAMES[0]) next.partName = FIRST_NAME;
  next.updatedAt = new Date().toISOString();
  return { score: next, cursor: clampCursor(next, { m: at.m, e: 0 }) };
}

/** A score whose staves got different lengths (edited by an older version of the app) gets them equal again. */
export function repairStaves(score: Score): Score {
  if (!score.second || score.second.measures.length === score.measures.length) return score;
  const next = structuredClone(score);
  equalize(next);
  return next;
}

/** New key signature: notes that followed the old key follow the new one. */
export function changeKey(score: Score, fifths: number): Score {
  const next = structuredClone(score);
  next.keyFifths = fifths;
  for (const m of staffLists(next).flat())
    for (const ev of m.events) {
      if (ev.rest || !ev.pitch) continue;
      const p = ev.pitch;
      const inKey = keyAlter(fifths, p.step);
      if (p.explicit) {
        if (p.alter === inKey) delete p.explicit;
      } else {
        const moved = { ...p, alter: inKey };
        ev.pitch = rangeError(moved) ? { ...p, explicit: true } : moved;
      }
    }
  return normalize(next, { m: 0, e: 0 }).score;
}

/** New time signature: the music of each staff is laid out again from the start, keeping ties and fingers. */
export function changeTime(score: Score, time: TimeSignature): Score {
  const first = relayout({ ...score, second: undefined }, time);
  if (!score.second) return first;
  const second = relayout({ ...swapStaves(score), second: undefined }, time);
  return normalize({ ...first, second: { ...score.second, measures: second.measures } }, { m: 0, e: 0 }).score;
}

function relayout(score: Score, time: TimeSignature): Score {
  const oldPerMeasure = measureUnits(score.time);
  const items: (Item & { tie?: boolean; user?: boolean })[] = [];
  for (const m of score.measures)
    for (const ev of m.events) {
      const len = eventUnits(ev, oldPerMeasure);
      const prev = items[items.length - 1];
      if (!ev.rest && prev && !prev.rest && prev.tie && samePitch(prev.pitch, ev.pitch)) {
        prev.units += len;
        prev.tie = ev.tie;
      } else if (ev.rest && ev.auto && prev?.rest && !prev.user) {
        prev.units += len;
      } else {
        items.push({
          rest: ev.rest,
          units: len,
          pitch: ev.pitch,
          finger: ev.finger,
          tie: ev.tie,
          user: ev.rest && !ev.auto,
        });
      }
    }
  while (items.length && items[items.length - 1].rest && !items[items.length - 1].user) items.pop();
  let next: Score = { ...structuredClone(score), time, measures: [emptyMeasure()] };
  let at: Cursor = { m: 0, e: 0 };
  for (const item of items) {
    const w = write(next, at, {
      rest: item.rest,
      userRest: item.user,
      units: item.units,
      pitch: item.pitch,
      finger: item.finger,
      tieOut: item.tie,
    });
    next = w.score;
    const after = nextCursor(next, w.last);
    if (after) at = after;
    else {
      next.measures.push(emptyMeasure());
      at = { m: next.measures.length - 1, e: 0 };
    }
  }
  const newPerMeasure = measureUnits(time);
  while (next.measures.length > 1 && next.measures[next.measures.length - 1].events.every((ev) => ev.full))
    next.measures.pop();
  const target = Math.max(1, Math.ceil(score.measures.length * (oldPerMeasure / newPerMeasure)));
  while (next.measures.length < Math.min(target, score.measures.length * 2)) next.measures.push(emptyMeasure());
  const result = normalize(next, { m: 0, e: 0 }).score;
  delete result.second;
  return result;
}

/** How many measures to show and print: trailing empty measures the editor added, on every staff, are hidden. */
export function visibleCount(score: Score) {
  const lists = staffLists(score);
  const hidden = (i: number) => lists.every((ms) => !ms[i] || (ms[i].auto && ms[i].events.every((ev) => ev.full)));
  let n = score.measures.length;
  while (n > 1 && hidden(n - 1)) n--;
  return n;
}

/** Measures of the first staff to show and print (see `visibleCount`). */
export function visibleMeasures(score: Score) {
  return score.measures.slice(0, visibleCount(score));
}

/** Measures of every staff to show and print, first staff first. */
export function visibleStaves(score: Score) {
  const n = visibleCount(score);
  return staffLists(score).map((ms) => Array.from({ length: n }, (_, i) => ms[i] ?? emptyMeasure()));
}

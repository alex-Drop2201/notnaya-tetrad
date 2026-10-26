import { useCallback, useEffect, useRef, useState } from "react";
import { previewNote } from "@/lib/audio";
import { midiOf } from "@/lib/pitch";
import {
  addSecondStaff,
  backspace,
  backspaceTarget,
  clampCursor,
  deleteMeasure,
  duplicateMeasure,
  ERRORS,
  enterNote,
  enterRest,
  eventAt,
  fromStaffView,
  insertMeasure,
  nextCursor,
  prevCursor,
  removeSecondStaff,
  setAccidental,
  setDuration,
  setFinger,
  setPitch,
  shiftPitch,
  slotAfter,
  staffView,
  toggleRepeat,
  toggleTie,
} from "@/lib/score";
import { prefs, saveScore } from "@/lib/storage";
import type { Base, Cursor, Dots, EditResult, NoteEvent, Pitch, Score, StaffIndex } from "@/lib/types";

// Editor state: the score, the cursor, the chosen note value, undo/redo and the message
// line. Saving is debounced and flushed when the page is hidden.
//
// The cursor selects one event. After Backspace it selects the event before the deleted
// one with `after` set: like a text caret after that event, the next note or rest is
// written into the empty place behind it, and note values don't change it.
//
// With a second staff, `staff` is the one being written: the cursor points into it and
// every edit runs on `staffView` of it (see lib/score.ts).

export interface NoteValue {
  base: Base;
  dots: Dots;
}

export interface EditorNotice {
  id: number;
  /** "fix": the editor adjusted the input (e.g. split a note); "error": the edit was refused. */
  kind: "fix" | "error";
  text: string;
  at?: Cursor;
}

interface Snapshot {
  score: Score;
  cursor: Cursor;
  staff: StaffIndex;
}

const VALUE_KEY = "nt.value";
const SAVE_DELAY = 400;

function savedValue(): NoteValue {
  const [b, d] = (prefs.get(VALUE_KEY) ?? "4.0").split(".").map(Number);
  const base = ([1, 2, 4, 8, 16] as const).find((x) => x === b) ?? 4;
  return { base, dots: +(d === 1 && base !== 16) as Dots };
}

/** Filler rests and empty measures don't count as something to edit. */
export function isEditable(ev: NoteEvent | undefined): ev is NoteEvent {
  return !!ev && !(ev.rest && (ev.auto || ev.full));
}

export function useEditor(initial: Score, initialCursor?: Cursor, initialStaff: StaffIndex = 0) {
  const [state, setState] = useState<Snapshot>(() => {
    const staff = initial.second ? initialStaff : 0;
    return { score: initial, cursor: clampCursor(staffView(initial, staff), initialCursor ?? { m: 0, e: 0 }), staff };
  });
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [value, setValueState] = useState<NoteValue>(() => {
    const ev = eventAt(staffView(initial, state.staff), state.cursor);
    return isEditable(ev) ? { base: ev.base, dots: ev.dots } : savedValue();
  });
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [flash, setFlash] = useState<Cursor | null>(null);
  const [after, setAfterState] = useState(false);
  const afterRef = useRef(after);
  const setAfter = (v: boolean) => {
    afterRef.current = v;
    setAfterState(v);
  };
  const current = useRef(state);
  current.current = state;

  const pending = useRef<Score | null>(null);
  const timer = useRef(0);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current) {
      saveScore(pending.current);
      pending.current = null;
    }
  }, []);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  const scheduleSave = useCallback(
    (score: Score) => {
      pending.current = score;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  /** Applies an edit result (of the whole score; `staff` switches to that staff). Returns false if the edit was refused. */
  const apply = useCallback(
    (result: EditResult, opts: { sound?: boolean; staff?: StaffIndex } = {}) => {
      const prev = current.current;
      if (result.error) {
        setNotice({ id: Date.now(), kind: "error", text: result.error, at: prev.cursor });
        return false;
      }
      if (result.score !== prev.score) {
        setUndoStack((s) => [...s.slice(-199), prev]);
        setRedoStack([]);
        scheduleSave(result.score);
      }
      const staff = result.score.second ? (opts.staff ?? prev.staff) : 0;
      setState({ score: result.score, cursor: result.cursor, staff });
      if (result.notice) {
        setNotice({ id: Date.now(), kind: "fix", text: result.notice, at: result.changed });
        if (result.changed) setFlash(result.changed);
      } else setNotice((n) => (n?.kind === "error" ? null : n));
      if (opts.sound && result.changed) {
        const ev = eventAt(staffView(result.score, staff), result.changed);
        if (ev?.pitch) previewNote(midiOf(ev.pitch));
      }
      return true;
    },
    [scheduleSave],
  );

  /** Runs an edit on the staff being written and puts its result back into the whole score. */
  const onStaff = <R extends EditResult>(edit: (view: Score) => R): R => {
    const s = current.current;
    const view = staffView(s.score, s.staff);
    const result = edit(view);
    return result.score === view ? { ...result, score: s.score } : { ...result, score: fromStaffView(result.score, s.staff) };
  };

  const setValue = (v: NoteValue) => {
    setValueState(v);
    prefs.set(VALUE_KEY, `${v.base}.${v.dots}`);
  };

  const view = staffView(state.score, state.staff);
  const selected = eventAt(view, state.cursor);
  const editable = isEditable(selected) && !after;
  const deleteTarget = eventAt(view, backspaceTarget(view, state.cursor) ?? { m: -1, e: -1 });

  /** Where a new note or rest goes in `view`: the cursor, or the empty place after it. */
  const insertionPoint = (view: Score) => {
    const cursor = current.current.cursor;
    return afterRef.current ? slotAfter(view, cursor) : { score: view, at: cursor };
  };

  const actions = {
    /** Selects an event of `staff` (by default the staff being written). */
    select(at: Cursor, staff: StaffIndex = current.current.staff) {
      setAfter(false);
      const pick = (score: Score) => (score.second ? staff : 0);
      setState((p) => ({ ...p, cursor: clampCursor(staffView(p.score, pick(p.score)), at), staff: pick(p.score) }));
      const v = staffView(current.current.score, pick(current.current.score));
      const ev = eventAt(v, clampCursor(v, at));
      if (ev?.pitch) previewNote(midiOf(ev.pitch));
      if (isEditable(ev)) setValue({ base: ev.base, dots: ev.dots });
      setNotice((n) => (n?.kind === "error" ? null : n));
    },
    move(dir: 1 | -1) {
      const s = current.current;
      const v = staffView(s.score, s.staff);
      const to = dir === 1 ? nextCursor(v, s.cursor) : prevCursor(v, s.cursor);
      if (to) actions.select(to);
    },
    enterNote(pitch: Pitch, at?: Cursor) {
      const result = onStaff((v) => {
        const p = at ? { score: v, at } : insertionPoint(v);
        return enterNote(p.score, p.at, pitch, value.base, !!value.dots);
      });
      const ok = apply(result, { sound: true });
      if (ok) setAfter(false);
      return ok;
    },
    enterRest() {
      const result = onStaff((v) => {
        const p = insertionPoint(v);
        return enterRest(p.score, p.at, value.base, !!value.dots);
      });
      if (apply(result)) setAfter(false);
    },
    chooseValue(base: Base) {
      const dots: Dots = base === 16 ? 0 : value.dots;
      setValue({ base, dots });
      if (editable) {
        const cursor = current.current.cursor;
        apply(
          onStaff((v) => setDuration(v, cursor, base, !!dots)),
          { sound: true },
        );
      }
    },
    toggleDot() {
      if (value.base === 16) {
        setNotice({ id: Date.now(), kind: "error", text: ERRORS.dotSixteenth });
        return;
      }
      const dots = +!value.dots as Dots;
      setValue({ base: value.base, dots });
      if (editable) {
        const cursor = current.current.cursor;
        apply(
          onStaff((v) => setDuration(v, cursor, value.base, !!dots)),
          { sound: true },
        );
      }
    },
    /** Backspace: deletes the selected event (or the last one before an empty place) and steps back. */
    remove() {
      const s = current.current;
      const result = onStaff((v) => backspace(v, s.cursor));
      if (result.score === s.score) return;
      apply(result);
      setAfter(result.after);
    },
    setPitch(at: Cursor, pitch: Pitch) {
      return apply(
        onStaff((v) => setPitch(v, at, pitch)),
        { sound: true },
      );
    },
    stepPitch(steps: number) {
      const cursor = current.current.cursor;
      apply(
        onStaff((v) => shiftPitch(v, cursor, steps)),
        { sound: true },
      );
    },
    accidental(alter: -1 | 0 | 1) {
      const cursor = current.current.cursor;
      apply(
        onStaff((v) => setAccidental(v, cursor, alter)),
        { sound: true },
      );
    },
    tie() {
      const cursor = current.current.cursor;
      apply(onStaff((v) => toggleTie(v, cursor)));
    },
    finger(finger: number | null) {
      const cursor = current.current.cursor;
      apply(onStaff((v) => setFinger(v, cursor, finger)));
    },
    addMeasure() {
      const cursor = current.current.cursor;
      setAfter(false);
      apply(onStaff((v) => insertMeasure(v, cursor)));
    },
    duplicateMeasure() {
      const cursor = current.current.cursor;
      setAfter(false);
      apply(onStaff((v) => duplicateMeasure(v, cursor)));
    },
    deleteMeasure() {
      const cursor = current.current.cursor;
      setAfter(false);
      apply(onStaff((v) => deleteMeasure(v, cursor)));
    },
    repeat(side: "start" | "end") {
      const cursor = current.current.cursor;
      apply(onStaff((v) => toggleRepeat(v, cursor, side)));
    },
    /** Adds the second staff and starts writing on it. */
    addSecondStaff() {
      const s = current.current;
      setAfter(false);
      apply(addSecondStaff(s.score, s.cursor), { staff: 1 });
    },
    removeSecondStaff() {
      const s = current.current;
      setAfter(false);
      apply(removeSecondStaff(s.score, s.cursor), { staff: 0 });
    },
    undo() {
      if (!undoStack.length) return;
      const prev = undoStack[undoStack.length - 1];
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [current.current, ...s]);
      setState(prev);
      setAfter(false);
      scheduleSave(prev.score);
      setNotice(null);
    },
    redo() {
      if (!redoStack.length) return;
      const next = redoStack[0];
      setRedoStack((s) => s.slice(1));
      setUndoStack((s) => [...s, current.current]);
      setState(next);
      setAfter(false);
      scheduleSave(next.score);
    },
    error(text: string) {
      setNotice({ id: Date.now(), kind: "error", text, at: current.current.cursor });
    },
    /** Drops the save that is still waiting, so a deleted part isn't written back on leaving. */
    discardPendingSave() {
      window.clearTimeout(timer.current);
      pending.current = null;
    },
    dismissNotice() {
      setNotice(null);
    },
  };

  return {
    score: state.score,
    cursor: state.cursor,
    /** The staff being written: 0, or 1 for the second staff. */
    staff: state.staff,
    selected,
    /** The caret is after the selected event (see above). */
    after,
    /** What Backspace deletes now, if anything. */
    deleteTarget,
    value,
    notice,
    flash,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    actions,
  };
}

export type Editor = ReturnType<typeof useEditor>;

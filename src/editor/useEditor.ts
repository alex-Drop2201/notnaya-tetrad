import { useCallback, useEffect, useRef, useState } from "react";
import { previewNote } from "@/lib/audio";
import { midiOf } from "@/lib/pitch";
import {
  clampCursor,
  clearEvent,
  deleteMeasure,
  duplicateMeasure,
  ERRORS,
  enterNote,
  enterRest,
  eventAt,
  insertMeasure,
  nextCursor,
  prevCursor,
  setAccidental,
  setDuration,
  setFinger,
  setPitch,
  shiftPitch,
  toggleRepeat,
  toggleTie,
} from "@/lib/score";
import { prefs, saveScore } from "@/lib/storage";
import type { Base, Cursor, Dots, EditResult, NoteEvent, Pitch, Score } from "@/lib/types";

// Editor state: the score, the cursor, the chosen note value, undo/redo and the message
// line. Saving is debounced and flushed when the page is hidden.

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

export function useEditor(initial: Score, initialCursor?: Cursor) {
  const [state, setState] = useState<Snapshot>(() => ({
    score: initial,
    cursor: clampCursor(initial, initialCursor ?? { m: 0, e: 0 }),
  }));
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [value, setValueState] = useState<NoteValue>(() => {
    const ev = eventAt(initial, clampCursor(initial, initialCursor ?? { m: 0, e: 0 }));
    return isEditable(ev) ? { base: ev.base, dots: ev.dots } : savedValue();
  });
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [flash, setFlash] = useState<Cursor | null>(null);
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

  /** Applies an edit result. Returns false if the edit was refused. */
  const apply = useCallback(
    (result: EditResult, opts: { sound?: boolean } = {}) => {
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
      setState({ score: result.score, cursor: result.cursor });
      if (result.notice) {
        setNotice({ id: Date.now(), kind: "fix", text: result.notice, at: result.changed });
        if (result.changed) setFlash(result.changed);
      } else setNotice((n) => (n?.kind === "error" ? null : n));
      if (opts.sound && result.changed) {
        const ev = eventAt(result.score, result.changed);
        if (ev?.pitch) previewNote(midiOf(ev.pitch));
      }
      return true;
    },
    [scheduleSave],
  );

  const setValue = (v: NoteValue) => {
    setValueState(v);
    prefs.set(VALUE_KEY, `${v.base}.${v.dots}`);
  };

  const selected = eventAt(state.score, state.cursor);
  const editable = isEditable(selected);

  const actions = {
    select(at: Cursor) {
      setState((s) => ({ ...s, cursor: clampCursor(s.score, at) }));
      const ev = eventAt(current.current.score, at);
      if (ev?.pitch) previewNote(midiOf(ev.pitch));
      if (isEditable(ev)) setValue({ base: ev.base, dots: ev.dots });
      setNotice((n) => (n?.kind === "error" ? null : n));
    },
    move(dir: 1 | -1) {
      const s = current.current;
      const to = dir === 1 ? nextCursor(s.score, s.cursor) : prevCursor(s.score, s.cursor);
      if (to) actions.select(to);
    },
    enterNote(pitch: Pitch, at?: Cursor) {
      const s = current.current;
      return apply(enterNote(s.score, at ?? s.cursor, pitch, value.base, !!value.dots), { sound: true });
    },
    enterRest() {
      const s = current.current;
      apply(enterRest(s.score, s.cursor, value.base, !!value.dots));
    },
    chooseValue(base: Base) {
      const dots: Dots = base === 16 ? 0 : value.dots;
      setValue({ base, dots });
      if (editable) {
        const s = current.current;
        apply(setDuration(s.score, s.cursor, base, !!dots), { sound: true });
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
        const s = current.current;
        apply(setDuration(s.score, s.cursor, value.base, !!dots), { sound: true });
      }
    },
    remove() {
      const s = current.current;
      apply(clearEvent(s.score, s.cursor));
    },
    setPitch(at: Cursor, pitch: Pitch) {
      const s = current.current;
      return apply(setPitch(s.score, at, pitch), { sound: true });
    },
    stepPitch(steps: number) {
      const s = current.current;
      apply(shiftPitch(s.score, s.cursor, steps), { sound: true });
    },
    accidental(alter: -1 | 0 | 1) {
      const s = current.current;
      apply(setAccidental(s.score, s.cursor, alter), { sound: true });
    },
    tie() {
      const s = current.current;
      apply(toggleTie(s.score, s.cursor));
    },
    finger(finger: number | null) {
      const s = current.current;
      apply(setFinger(s.score, s.cursor, finger));
    },
    addMeasure() {
      const s = current.current;
      apply(insertMeasure(s.score, s.cursor));
    },
    duplicateMeasure() {
      const s = current.current;
      apply(duplicateMeasure(s.score, s.cursor));
    },
    deleteMeasure() {
      const s = current.current;
      apply(deleteMeasure(s.score, s.cursor));
    },
    repeat(side: "start" | "end") {
      const s = current.current;
      apply(toggleRepeat(s.score, s.cursor, side));
    },
    undo() {
      if (!undoStack.length) return;
      const prev = undoStack[undoStack.length - 1];
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [current.current, ...s]);
      setState(prev);
      scheduleSave(prev.score);
      setNotice(null);
    },
    redo() {
      if (!redoStack.length) return;
      const next = redoStack[0];
      setRedoStack((s) => s.slice(1));
      setUndoStack((s) => [...s, current.current]);
      setState(next);
      scheduleSave(next.score);
    },
    error(text: string) {
      setNotice({ id: Date.now(), kind: "error", text, at: current.current.cursor });
    },
    dismissNotice() {
      setNotice(null);
    },
  };

  return {
    score: state.score,
    cursor: state.cursor,
    selected,
    value,
    notice,
    flash,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    actions,
  };
}

export type Editor = ReturnType<typeof useEditor>;

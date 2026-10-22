import { useEffect, useState } from "react";
import {
  Accidental,
  Annotation,
  BarlineType,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  Voice,
  type RenderContext,
} from "vexflow/bravura";
import { vexDuration } from "./durations";
import { diatonicOf, KEY_SPECS, keyAlter, samePitch, vexKey } from "./pitch";
import { isEmpty } from "./score";
import type { Measure, NoteEvent, Pitch, Score } from "./types";

// Engraving with VexFlow: measures are laid out into systems (lines of staff),
// then drawn as SVG. The same code draws the editor, the previews and the PDF pages.
// Every note's SVG group gets the id `vf-<event id>`, so the editor can highlight the
// selected or playing note with a class instead of drawing the score again.

/** Diatonic position of the top staff line, F5. */
export const STAFF_TOP = 38;
const SPACE = 10;

export interface StaffColors {
  ink: string;
}

export interface EngraveOptions {
  width: number;
  colors: StaffColors;
  /** Room left of the first system, for the part name in the PDF. */
  firstIndent?: number;
  maxPerSystem?: number;
  /** Stretch the last system to full width when it is at least this full. */
  justifyLast?: number;
  topPad?: number;
  systemGap?: number;
  /** Draw the final barline after the last measure. */
  final?: boolean;
  /** Editor view: empty time is left blank instead of printed as rests. */
  editor?: boolean;
}

/** One drawn line of staff, in unscaled coordinates. */
export interface SystemBox {
  index: number;
  top: number;
  bottom: number;
  staffTop: number;
  spacing: number;
  x0: number;
  x1: number;
  measures: number[];
}

/** Tap target of one event. */
export interface Hit {
  m: number;
  e: number;
  system: number;
  x0: number;
  x1: number;
  x: number;
  /** Notehead y; null for rests. */
  y: number | null;
  rest: boolean;
}

function timeSpec(score: Score) {
  return score.time.symbol === "common" ? "C" : score.time.symbol === "cut" ? "C|" : `${score.time.beats}/${score.time.beatType}`;
}

/** Accidentals to print: those that differ from the key or from earlier in the measure. */
function accidentalsFor(measures: Measure[], fifths: number) {
  const shown = new Map<string, string>();
  // A note tied over from the same pitch repeats no accidental; after a slur it does.
  let tiedFrom: Pitch | undefined;
  for (const measure of measures) {
    const inMeasure = new Map<number, number>();
    for (const ev of measure.events) {
      if (ev.rest || !ev.pitch) {
        tiedFrom = undefined;
        continue;
      }
      const p = ev.pitch;
      const pos = diatonicOf(p);
      if (!samePitch(tiedFrom, p) && (inMeasure.get(pos) ?? keyAlter(fifths, p.step)) !== p.alter) {
        shown.set(ev.id, p.alter === 1 ? "#" : p.alter === -1 ? "b" : "n");
        inMeasure.set(pos, p.alter);
      }
      tiedFrom = ev.tie ? p : undefined;
    }
  }
  return shown;
}

interface BuiltMeasure {
  index: number;
  notes: StaveNote[];
  voice: Voice;
  beams: Beam[];
  minWidth: number;
  /** Lowest and highest notes, in staff spaces below the top line. */
  lowest: number;
  highest: number;
  hasFinger: boolean;
}

function restNote(ev: NoteEvent) {
  return new StaveNote({
    keys: ["b/4"],
    duration: ev.full ? "wr" : `${vexDuration(ev.base)}${ev.dots ? "d" : ""}r`,
    align_center: !!ev.full,
  });
}

function pitchedNote(ev: NoteEvent, accidental: string | undefined) {
  const note = new StaveNote({
    keys: [vexKey(ev.pitch!)],
    duration: `${vexDuration(ev.base)}${ev.dots ? "d" : ""}`,
    auto_stem: true,
    clef: "treble",
  });
  if (accidental) note.addModifier(new Accidental(accidental), 0);
  if (ev.finger != null)
    note.addModifier(
      new Annotation(String(ev.finger)).setFont("Times", 11, "bold").setVerticalJustification(Annotation.VerticalJustify.TOP),
      0,
    );
  return note;
}

function buildMeasure(score: Score, measure: Measure, index: number, accidentals: Map<string, string>): BuiltMeasure {
  let lowest = 4;
  let highest = 0;
  let hasFinger = false;
  const notes = measure.events.map((ev) => {
    let note: StaveNote;
    if (ev.rest) note = restNote(ev);
    else {
      const below = (STAFF_TOP - diatonicOf(ev.pitch!)) / 2;
      lowest = Math.max(lowest, below);
      highest = Math.min(highest, below);
      if (ev.finger != null) hasFinger = true;
      note = pitchedNote(ev, accidentals.get(ev.id));
    }
    note.setAttribute("id", ev.id);
    return note;
  });
  measure.events.forEach((ev, i) => {
    if (ev.dots && !ev.full) Dot.buildAndAttach([notes[i]], { all: true });
  });
  const voice = new Voice({ num_beats: score.time.beats, beat_value: score.time.beatType });
  voice.setMode(Voice.Mode.SOFT);
  voice.addTickables(notes);
  return {
    index,
    notes,
    voice,
    beams: Beam.generateBeams(
      notes.filter((_, i) => !measure.events[i].rest),
      { groups: Beam.getDefaultBeamGroups(`${score.time.beats}/${score.time.beatType}`) },
    ),
    minWidth: new Formatter().joinVoices([voice]).preCalculateMinTotalWidth([voice]),
    lowest,
    highest,
    hasFinger,
  };
}

/** Where notes start after the clef, key and (on the first line) time signature. */
function staveStartX(score: Score, withTime: boolean) {
  const stave = new Stave(0, 0, 400);
  stave.addClef("treble").addKeySignature(KEY_SPECS[score.keyFifths]);
  if (withTime) stave.addTimeSignature(timeSpec(score));
  return stave.getNoteStartX();
}

function measureWidth(m: BuiltMeasure) {
  return Math.max(70, m.minWidth * 1.45 + 30);
}

interface SystemLayout {
  measures: BuiltMeasure[];
  widths: number[];
  x0: number;
  /** Room above and below the staff, in staff spaces. */
  above: number;
  below: number;
  /** First system: height of the tempo mark's baseline above the top line, in staff spaces. */
  tempoAt: number;
}

/** VexFlow puts the tempo mark 2.4 spaces above the top line; it is raised over high notes and fingering. */
const TEMPO_DEFAULT = 2.4;

function layoutSystems(score: Score, built: BuiltMeasure[], opts: EngraveOptions): SystemLayout[] {
  const firstStart = staveStartX(score, true);
  const nextStart = staveStartX(score, false);
  const max = opts.maxPerSystem ?? 4;
  const lines: BuiltMeasure[][] = [];
  let line: BuiltMeasure[] = [];
  let lineWidth = 0;
  for (const m of built) {
    const first = lines.length === 0;
    const start = (first ? (opts.firstIndent ?? 0) : 0) + (first ? firstStart : nextStart);
    const w = measureWidth(m);
    if (line.length > 0 && (start + lineWidth + w > opts.width || line.length >= max)) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    line.push(m);
    lineWidth += w;
  }
  if (line.length) lines.push(line);
  return lines.map((ms, i) => {
    const indent = i === 0 ? (opts.firstIndent ?? 0) : 0;
    const start = i === 0 ? firstStart : nextStart;
    const natural = ms.map(measureWidth);
    const total = natural.reduce((a, b) => a + b, 0);
    const room = opts.width - indent - start;
    const stretch =
      i !== lines.length - 1 || total / room > (opts.justifyLast ?? 0.6) ? room / total : Math.min(1.25, room / total);
    const lowest = Math.max(...ms.map((m) => m.lowest));
    const highest = Math.min(...ms.map((m) => m.highest));
    const finger = ms.some((m) => m.hasFinger) ? 1.6 : 0;
    const above = Math.max(3, -highest + 3.5 + finger);
    // The tempo mark stands over the first measure: above its highest note and fingering.
    const first = ms[0];
    const tempoAt = Math.max(TEMPO_DEFAULT, -first.highest + 0.6 + (first.hasFinger ? 1.8 : 0) + 0.9);
    return {
      measures: ms,
      widths: natural.map((w, j) => w * stretch + (j === 0 ? start : 0)),
      x0: indent,
      above: i === 0 ? Math.max(above, tempoAt + 2.1) : above,
      below: Math.max(2.5, lowest - 4 + 3),
      tempoAt,
    };
  });
}

function systemHeight(s: SystemLayout) {
  return (s.above + 4 + s.below) * SPACE;
}

function drawSystems(
  ctx: RenderContext,
  score: Score,
  measures: Measure[],
  systems: SystemLayout[],
  opts: EngraveOptions,
  top: number,
  range: [number, number] = [0, systems.length],
) {
  const boxes: SystemBox[] = [];
  const hits: Hit[] = [];
  const drawn = new Map<string, { note: StaveNote; system: number }>();
  const last = measures.length - 1;
  let y = top;
  for (let si = range[0]; si < range[1]; si++) {
    const sys = systems[si];
    const staveY = y + (sys.above - 4) * SPACE;
    let x = sys.x0;
    const staves: Stave[] = [];
    sys.measures.forEach((bm, j) => {
      const measure = measures[bm.index];
      const stave = new Stave(x, staveY, sys.widths[j], { fill_style: opts.colors.ink });
      if (j === 0) {
        stave.addClef("treble").addKeySignature(KEY_SPECS[score.keyFifths]);
        if (si === 0) {
          stave.addTimeSignature(timeSpec(score));
          stave.setTempo({ duration: "q", bpm: score.tempo }, -4 - (sys.tempoAt - TEMPO_DEFAULT) * SPACE);
        }
      } else stave.setBegBarType(BarlineType.NONE);
      if (measure.repeatStart) stave.setBegBarType(BarlineType.REPEAT_BEGIN);
      if (measure.repeatEnd) stave.setEndBarType(BarlineType.REPEAT_END);
      else if (bm.index === last && opts.final !== false) stave.setEndBarType(BarlineType.END);
      stave.setContext(ctx);
      bm.voice.setStave(stave);
      bm.notes.forEach((n) => n.setStave(stave));
      new Formatter().joinVoices([bm.voice]).format([bm.voice], stave.getNoteEndX() - stave.getNoteStartX() - 12);
      staves.push(stave);
      x += sys.widths[j];
    });
    const staffTop = staves[0].getYForLine(0);
    boxes.push({
      index: si,
      top: y,
      bottom: y + systemHeight(sys),
      staffTop,
      spacing: SPACE,
      x0: sys.x0,
      x1: x,
      measures: sys.measures.map((m) => m.index),
    });
    sys.measures.forEach((bm, j) => {
      const measure = measures[bm.index];
      const stave = staves[j];
      const centers = bm.notes.map((n) => n.getAbsoluteX() + n.getGlyphWidth() / 2);
      bm.notes.forEach((note, e) => {
        const ev = measure.events[e];
        const color = opts.editor && isEmpty(ev) ? "transparent" : opts.colors.ink;
        note.setStyle({ fillStyle: color, strokeStyle: color });
        note.setLedgerLineStyle({ fillStyle: opts.colors.ink, strokeStyle: opts.colors.ink });
        const x0 = e === 0 ? stave.getNoteStartX() - 6 : (centers[e - 1] + centers[e]) / 2;
        const x1 = e === bm.notes.length - 1 ? stave.getX() + stave.getWidth() : (centers[e] + centers[e + 1]) / 2;
        hits.push({
          m: bm.index,
          e,
          system: si,
          x0,
          x1,
          x: ev.full ? (stave.getNoteStartX() + stave.getNoteEndX()) / 2 : centers[e],
          y: ev.rest ? null : note.getYs()[0],
          rest: ev.rest,
        });
        drawn.set(ev.id, { note, system: si });
      });
      stave.draw();
      bm.voice.draw(ctx, stave);
      bm.beams.forEach((b) => b.setContext(ctx).draw());
    });
    const firstMeasure = sys.measures[0].index;
    if (si > 0) {
      ctx.save();
      ctx.setFont("Times", 10, "normal");
      ctx.setFillStyle(opts.colors.ink);
      ctx.fillText(String(firstMeasure + 1), sys.x0 + 1, staffTop - 12);
      ctx.restore();
    }
    y += systemHeight(sys) + (opts.systemGap ?? 8);
  }
  // Ties and slurs: an arc from each event marked `tie` to the next written one.
  const events = measures.flatMap((m) => m.events);
  events.forEach((ev, i) => {
    const next = events[i + 1];
    if (!ev.tie || isEmpty(ev) || isEmpty(next)) return;
    const from = drawn.get(ev.id);
    const to = drawn.get(next.id);
    if (!from && !to) return;
    const style = { fillStyle: opts.colors.ink, strokeStyle: opts.colors.ink };
    const tie = (first: StaveNote | null, lastNote: StaveNote | null) =>
      new StaveTie({ first_note: first, last_note: lastNote, first_indices: [0], last_indices: [0] })
        .setStyle(style)
        .setContext(ctx)
        .draw();
    if (from && to && from.system === to.system) tie(from.note, to.note);
    else {
      // Tie broken by a line end: half a tie on each side.
      if (from) tie(from.note, null);
      if (to) tie(null, to.note);
    }
  });
  return { layout: { systems: boxes, height: y - top }, hits };
}

/** Explicit text sizes and a font svg2pdf can map, so the PDF prints like the screen. */
function fixSvgText(el: HTMLElement) {
  el.querySelectorAll("svg text").forEach((t) => {
    const raw = t.getAttribute("font-size") ?? "";
    const n = parseFloat(raw);
    const px = !raw || Number.isNaN(n) ? 13 : raw.endsWith("pt") ? (n * 4) / 3 : n;
    t.setAttribute("font-size", String(Math.round(px * 100) / 100));
    t.setAttribute("font-family", "Times New Roman, Times, serif");
  });
}

export function prepareLayout(score: Score, measures: Measure[], opts: EngraveOptions) {
  const accidentals = accidentalsFor(measures, score.keyFifths);
  return layoutSystems(
    score,
    measures.map((m, i) => buildMeasure(score, m, i, accidentals)),
    opts,
  );
}

/** Draws the whole score into `el`, scaled by `scale`. */
export function renderScore(el: HTMLElement, score: Score, measures: Measure[], scale: number, opts: EngraveOptions) {
  el.innerHTML = "";
  const systems = prepareLayout(score, measures, opts);
  const top = opts.topPad ?? 18;
  const height = systems.reduce((h, s) => h + systemHeight(s) + (opts.systemGap ?? 8), top) + 8;
  const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(opts.width * scale, height * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);
  const result = drawSystems(ctx, score, measures, systems, opts, top);
  fixSvgText(el);
  return result;
}

/** Splits systems into pages: [first, end) index ranges. */
export function paginate(systems: SystemLayout[], pageHeight: number, firstTop: number, gap: number) {
  const pages: [number, number][] = [];
  let start = 0;
  let y = firstTop;
  systems.forEach((s, i) => {
    const h = systemHeight(s) + gap;
    if (y + h > pageHeight && i > start) {
      pages.push([start, i]);
      start = i;
      y = 0;
    }
    y += h;
  });
  pages.push([start, systems.length]);
  return { systems: pages };
}

/** Draws one page worth of systems into `el` and returns its SVG. */
export function renderPage(
  el: HTMLElement,
  score: Score,
  measures: Measure[],
  systems: SystemLayout[],
  range: [number, number],
  opts: EngraveOptions,
  size: { width: number; height: number },
  top: number,
) {
  el.innerHTML = "";
  const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(size.width, size.height);
  drawSystems(renderer.getContext(), score, measures, systems, opts, top, range);
  fixSvgText(el);
  return el.querySelector("svg")!;
}

function readStaffColors(): StaffColors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return { ink: v("--ink") };
}

/** Staff colors from the theme, updated when the phone switches light/dark. */
export function useStaffColors() {
  const [colors, setColors] = useState(readStaffColors);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColors(readStaffColors());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return colors;
}

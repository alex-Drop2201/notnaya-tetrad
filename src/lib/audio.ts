import { eventUnits, measureUnits } from "./durations";
import { midiOf } from "./pitch";
import { visibleMeasures, visibleStaves } from "./score";
import type { Cursor, Measure, Score, StaffIndex } from "./types";

// Playback with violin samples (public/samples/violin-plain, one every minor third, without
// vibrato, 6 s long). Each note plays the nearest sample, re-pitched; notes longer than
// a sample loop its steady part. With a second staff both staves play together.

interface Step {
  start: number;
  duration: number;
  /** null for a rest. */
  midi: number | null;
  /** Events this sound covers (a tied note covers several), for the playhead. Empty on the other staff. */
  at: { cursor: Cursor; start: number }[];
  /** Slurred to the next note: played connected, without a gap. */
  legato?: boolean;
  staff: StaffIndex;
}

/** Order of measures with repeats unfolded; each repeat is taken once. */
function playOrder(score: Score) {
  const measures = visibleMeasures(score);
  const order: number[] = [];
  const repeated = new Set<number>();
  let i = 0;
  let guard = 0;
  while (i < measures.length && guard++ < 2000) {
    order.push(i);
    if (measures[i].repeatEnd && !repeated.has(i)) {
      repeated.add(i);
      let back = i;
      while (back > 0 && !measures[back].repeatStart) back--;
      i = back;
    } else i++;
  }
  return order;
}

/**
 * Sounds to play from `from`, an event of `staff`, in seconds; tied notes become one
 * sound. Every staff plays from the same moment; a note of the other staff that is
 * already sounding there is played for the time it has left. Only `staff` moves the playhead.
 */
export function schedule(score: Score, from: Cursor = { m: 0, e: 0 }, staff: StaffIndex = 0): Step[] {
  const staves = visibleStaves(score);
  const perMeasure = measureUnits(score.time);
  const unitSeconds = 60 / score.tempo / 4;
  const order = playOrder(score);
  const m0 = Math.min(from.m, staves[0].length - 1);
  const startAt = Math.max(0, order.indexOf(m0));
  const own = staves[staff] ?? staves[0];
  let offset = 0;
  own[m0].events.forEach((ev, e) => e < from.e && (offset += eventUnits(ev, perMeasure)));
  return staves.flatMap((measures, k) =>
    staffSteps(measures, order.slice(startAt), offset, perMeasure, unitSeconds, k as StaffIndex, k === staff),
  );
}

function staffSteps(
  measures: Measure[],
  order: number[],
  offset: number,
  perMeasure: number,
  unitSeconds: number,
  staff: StaffIndex,
  marks: boolean,
): Step[] {
  const steps: Step[] = [];
  let t = 0;
  let open: Step | null = null;
  order.forEach((m, k) => {
    let at = 0;
    measures[m].events.forEach((ev, e) => {
      const units = eventUnits(ev, perMeasure);
      at += units;
      // In the first measure only what still sounds after `offset`.
      const left = k === 0 ? Math.min(units, at - offset) : units;
      if (left <= 0) return;
      const duration = left * unitSeconds;
      const mark = marks && left === units ? [{ cursor: { m, e }, start: t }] : [];
      if (ev.rest) {
        steps.push({ start: t, duration, midi: null, at: mark, staff });
        open = null;
      } else if (open && open.midi === midiOf(ev.pitch!)) {
        open.duration += duration;
        open.at.push(...mark);
        open.legato = ev.tie;
        if (!ev.tie) open = null;
      } else {
        const step: Step = { start: t, duration, midi: midiOf(ev.pitch!), at: mark, legato: ev.tie, staff };
        steps.push(step);
        open = ev.tie ? step : null;
      }
      t += duration;
    });
  });
  return steps;
}

const SAMPLES: [string, number][] = [
  ["G3", 55],
  ["Bb3", 58],
  ["Db4", 61],
  ["E4", 64],
  ["G4", 67],
  ["Bb4", 70],
  ["Db5", 73],
  ["E5", 76],
  ["G5", 79],
  ["Bb5", 82],
  ["Db6", 85],
  ["E6", 88],
  ["G6", 91],
  ["Bb6", 94],
  ["Db7", 97],
  ["E7", 100],
];

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<number, AudioBuffer>();
let loading: Promise<void> | null = null;

function audio() {
  if (!context) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    context = new Ctx();
    master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
  }
  return context;
}

/** Call from a user gesture: iOS starts audio only then, and plays it even in silent mode. */
export function unlockAudio() {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {}
  const ctx = audio();
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  loadSamples();
}

function loadSamples() {
  if (loading) return loading;
  const ctx = audio();
  loading = Promise.all(
    SAMPLES.map(async ([name, midi]) => {
      const data = await (await fetch(`./samples/violin-plain/${name}.mp3`)).arrayBuffer();
      buffers.set(midi, await ctx.decodeAudioData(data));
    }),
  ).then(() => undefined);
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

function nearestSample(midi: number) {
  let best = SAMPLES[0][1];
  for (const [, m] of SAMPLES) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  return best;
}

const LOOP_START = 1.2;
const LOOP_LENGTH = 3.5;
const ATTACK = 0.045;
const RELEASE = 0.07;

function playNote(midi: number, when: number, duration: number, volume = 0.8) {
  const ctx = audio();
  const sample = nearestSample(midi);
  const buffer = buffers.get(sample);
  if (!buffer || !master) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 2 ** ((midi - sample) / 12);
  if (duration > buffer.duration / src.playbackRate.value - 0.5) {
    // The samples have a steady pitch, so a loop of a whole number of periods joins
    // without a click wherever it starts.
    const period = 1 / (440 * 2 ** ((sample - 69) / 12));
    src.loop = true;
    src.loopStart = LOOP_START;
    src.loopEnd = LOOP_START + Math.round(LOOP_LENGTH / period) * period;
  }
  // Bow on, steady stroke, bow off.
  const gain = ctx.createGain();
  const end = when + duration;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + ATTACK);
  gain.gain.setValueAtTime(volume, Math.max(when + ATTACK, end - 0.02));
  gain.gain.setTargetAtTime(0, end, RELEASE);
  src.connect(gain).connect(master);
  src.start(when);
  src.stop(end + RELEASE * 7);
  return {
    stop(at = ctx.currentTime) {
      gain.gain.cancelScheduledValues(at);
      gain.gain.setTargetAtTime(0, at, 0.03);
      src.stop(at + 0.15);
    },
  };
}

let preview: ReturnType<typeof playNote> = null;

/** Short sound of one note, when it's entered or selected. */
export function previewNote(midi: number) {
  unlockAudio();
  const ctx = audio();
  const play = () => {
    preview?.stop();
    preview = playNote(midi, ctx.currentTime + 0.01, 0.55);
  };
  if (buffers.size) play();
  else loadSamples().then(play, () => {});
}

/** Plays the steps; `onCursor` follows the playhead, `onEnd` fires at the end or on stop. */
export async function play(steps: Step[], onCursor: (c: Cursor | null) => void, onEnd: () => void) {
  unlockAudio();
  await loadSamples();
  const ctx = audio();
  const t0 = ctx.currentTime + 0.12;
  // Two violins together are quieter each, so that they don't sum into clipping.
  const volume = steps.some((s) => s.staff === 1) ? 0.55 : 0.8;
  // Detached notes leave a short breath between bow strokes; slurred ones join the next.
  const voices = steps
    .filter((s) => s.midi !== null)
    .map((s) => playNote(s.midi!, t0 + s.start, s.legato ? s.duration + 0.03 : s.duration * 0.97, volume));
  const marks = steps.flatMap((s) => s.at).sort((a, b) => a.start - b.start);
  const total = Math.max(0, ...steps.map((s) => s.start + s.duration));
  let frame = 0;
  let stopped = false;
  let shown = -1;
  const tick = () => {
    if (stopped) return;
    const now = ctx.currentTime - t0;
    let idx = -1;
    for (let i = 0; i < marks.length && marks[i].start <= now; i++) idx = i;
    if (idx !== shown) {
      shown = idx;
      onCursor(idx >= 0 ? marks[idx].cursor : null);
    }
    if (now >= total + 0.1) stop();
    else frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    voices.forEach((v) => v?.stop());
    onCursor(null);
    onEnd();
  };
  frame = requestAnimationFrame(tick);
  return { stop };
}

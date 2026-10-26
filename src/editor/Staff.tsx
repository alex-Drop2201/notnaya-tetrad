import { ChevronsUpDown } from "lucide-react";
import type * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWidth } from "@/hooks/useWidth";
import { previewNote } from "@/lib/audio";
import { renderScore, STAFF_TOP, useStaffColors, type Hit, type SystemBox } from "@/lib/engrave";
import { diatonicOf, fromDiatonic, midiOf, pitchLabel, rangeError } from "@/lib/pitch";
import { staffLists } from "@/lib/score";
import type { Cursor, Pitch, Score, StaffIndex } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { EditorNotice } from "./useEditor";

// The editable staff. Tap selects an event. On the selected event a touch zone takes
// vertical drags: on a rest it places a note at the finger's height, on a note it moves
// the note up or down. The handle under the note shows that it can be dragged.
// With a second staff both are drawn; the one being written (`staff`) is in full ink,
// the other is faded, and a tap on it switches to it.

const SCALE = 1.1;

interface StaffProps {
  score: Score;
  /** The staff being written; `cursor` points into it. */
  staff: StaffIndex;
  cursor: Cursor;
  /** The caret is after the selected event: the next note goes into the place behind it. */
  after: boolean;
  playing: Cursor | null;
  flash: Cursor | null;
  notice: EditorNotice | null;
  onSelect: (at: Cursor, staff: StaffIndex) => void;
  onPlace: (at: Cursor, pitch: Pitch) => void;
  onRepitch: (at: Cursor, pitch: Pitch) => void;
  onError: (text: string) => void;
}

interface DragPreview {
  y: number;
  pitch: Pitch;
  problem: string | null;
}

interface Gesture {
  startY: number;
  base: Pitch | null;
  moved: boolean;
  mode: "place" | "move";
  last: number;
}

export function Staff({
  score,
  staff,
  cursor,
  after,
  playing,
  flash,
  notice,
  onSelect,
  onPlace,
  onRepitch,
  onError,
}: StaffProps) {
  const [wrapRef, width] = useWidth();
  const svgHost = useRef<HTMLDivElement>(null);
  const colors = useStaffColors();
  const [hits, setHits] = useState<Hit[]>([]);
  const [systems, setSystems] = useState<SystemBox[]>([]);
  const [drag, setDragState] = useState<DragPreview | null>(null);
  const dragRef = useRef<DragPreview | null>(null);
  const setDrag = (d: DragPreview | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const gesture = useRef<Gesture | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const measures = staffLists(score)[staff] ?? score.measures;
  const two = !!score.second;

  // Drawing a long part takes a while on a phone, so it happens only when the music,
  // the width or the theme changes. Selection and playhead are a class on the note.
  useLayoutEffect(() => {
    if (!svgHost.current || width <= 0) return;
    const result = renderScore(svgHost.current, score, staffLists(score), SCALE, {
      width: width / SCALE,
      maxPerSystem: 4,
      topPad: 22,
      systemGap: 6,
      colors,
      editor: true,
    });
    setHits(result.hits);
    setSystems(result.layout.systems);
  }, [score, width, colors]);

  useLayoutEffect(() => {
    const host = svgHost.current;
    if (!host) return;
    host.querySelectorAll(".nt-selected, .nt-playing").forEach((el) => el.classList.remove("nt-selected", "nt-playing"));
    const at = playing ?? cursor;
    const ev = measures[at.m]?.events[at.e];
    if (ev) host.querySelector(`#vf-${CSS.escape(ev.id)}`)?.classList.add(playing ? "nt-playing" : "nt-selected");
  }, [score, staff, cursor, playing, hits]);

  const hitAt = (c: Cursor) => hits.find((h) => h.staff === staff && h.m === c.m && h.e === c.e);
  const hit = hitAt(cursor);
  const system = hit ? systems.find((s) => s.index === hit.system) : undefined;
  const staffTop = system?.staffTops[staff] ?? 0;
  const playingHit = playing ? hitAt(playing) : undefined;
  const flashHit = flash ? hitAt(flash) : undefined;
  const event = measures[cursor.m]?.events[cursor.e];
  const handleY = hit && system && hit.y !== null ? Math.max(staffTop + system.spacing * 6.2, hit.y + system.spacing * 1.3) : 0;
  const region = system ? staffRegion(system, staff) : { top: 0, bottom: 0 };
  const zoneBottom = system ? Math.max(region.bottom, handleY + 30) : 0;

  useEffect(() => {
    zoneRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hit?.system, hit?.m, playing?.m]);

  const pitchAtY = (y: number, sys: SystemBox) =>
    fromDiatonic(STAFF_TOP - Math.round((y / SCALE - sys.staffTops[staff]) / (sys.spacing / 2)), score.keyFifths);
  const yOfPitch = (p: Pitch, sys: SystemBox) => (sys.staffTops[staff] + ((STAFF_TOP - diatonicOf(p)) * sys.spacing) / 2) * SCALE;

  const onStaffClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;
    const sys = systems.find((s) => y >= s.top && y <= s.bottom) ?? nearestSystem(systems, y);
    if (!sys) return;
    // The staff whose middle is nearest to the tap.
    const k = sys.staffTops.reduce(
      (best, top, i) => (Math.abs(top + 2 * sys.spacing - y) < Math.abs(sys.staffTops[best] + 2 * sys.spacing - y) ? i : best),
      0,
    ) as StaffIndex;
    const row = hits.filter((h) => h.system === sys.index && h.staff === k);
    const target =
      row.find((h) => x >= h.x0 && x < h.x1) ??
      row.reduce<Hit | undefined>((best, h) => (!best || Math.abs(h.x - x) < Math.abs(best.x - x) ? h : best), undefined);
    if (target) onSelect({ m: target.m, e: target.e }, k);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!system || !event) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const rect = wrapRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (event.rest) {
      const p = pitchAtY(y, system);
      gesture.current = { startY: y, base: null, moved: false, mode: "place", last: midiOf(p) };
      setDrag({ y: yOfPitch(p, system), pitch: p, problem: rangeError(p) });
    } else gesture.current = { startY: y, base: event.pitch!, moved: false, mode: "move", last: midiOf(event.pitch!) };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !system) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let p: Pitch;
    if (g.mode === "place") p = pitchAtY(y, system);
    else {
      if (!g.moved && Math.abs(y - g.startY) < 6) return;
      g.moved = true;
      const steps = Math.round((g.startY - y) / ((system.spacing / 2) * SCALE * 1.15));
      p = fromDiatonic(diatonicOf(g.base!) + steps, score.keyFifths);
      if (steps === 0) p = g.base!;
    }
    const problem = rangeError(p);
    setDrag({ y: yOfPitch(p, system), pitch: p, problem });
    const midi = midiOf(p);
    if (midi !== g.last) {
      g.last = midi;
      if (!problem) previewNote(midi);
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const d = dragRef.current;
    setDrag(null);
    if (!g || !d) {
      // A tap on the selected note plays it again.
      if (g?.mode === "move" && event?.pitch) previewNote(midiOf(event.pitch));
    } else if (d.problem) onError(d.problem);
    else if (g.mode === "place") onPlace(cursor, d.pitch);
    else if (g.moved && midiOf(d.pitch) !== midiOf(g.base!)) onRepitch(cursor, d.pitch);
  };

  const band = (h: Hit | undefined, className: string) => {
    const sys = h && systems.find((s) => s.index === h.system);
    if (!h || !sys) return null;
    return (
      <div
        aria-hidden
        className={cn("absolute rounded-md transition-[left,width,top] duration-150", className)}
        style={{
          left: h.x0 * SCALE + 1,
          width: (h.x1 - h.x0) * SCALE - 2,
          top: (sys.staffTops[staff] - sys.spacing * 2.2) * SCALE,
          height: sys.spacing * 8.4 * SCALE,
        }}
      />
    );
  };

  const errorBubble = notice?.kind === "error" && hit && system && (
    <div
      key={notice.id}
      role="status"
      className="absolute z-20 w-max max-w-[240px] -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-center text-footnote text-background shadow-[0_6px_20px_oklch(0.2_0.01_255/0.25)] animate-in fade-in-0 zoom-in-95"
      style={{
        left: Math.min(Math.max(hit.x * SCALE, 124), Math.max(124, width - 124)),
        top: Math.max(0, (staffTop - system.spacing * 2.6) * SCALE - 44),
      }}
    >
      {notice.text}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative select-none">
      {band(hit && !playing ? hit : undefined, "bg-select-soft")}
      {hit && system && after && !playing && (
        <div
          aria-hidden
          className="pointer-events-none absolute w-0.5 rounded-full bg-select animate-in fade-in-0"
          style={{
            left: hit.x1 * SCALE - 1,
            top: (staffTop - system.spacing * 1.5) * SCALE,
            height: system.spacing * 7 * SCALE,
          }}
        />
      )}
      {band(playingHit, "bg-playing-soft")}
      {band(flashHit, "bg-warning-soft animate-pulse")}
      <div
        ref={svgHost}
        onClick={onStaffClick}
        className="relative [&_svg]:block"
        data-active-staff={two ? staff : undefined}
        role="img"
        aria-label={
          two
            ? `Две нотные строки, ${score.measures.length} тактов; пишется ${staff === 0 ? "верхняя" : "нижняя"}`
            : `Нотный стан, ${score.measures.length} тактов`
        }
      />
      {hit && system && !playing && (
        <div
          ref={zoneRef}
          className="absolute touch-none scroll-my-6"
          style={{
            left: hit.x0 * SCALE,
            width: Math.max(44, (hit.x1 - hit.x0) * SCALE),
            top: region.top * SCALE,
            height: (zoneBottom - region.top) * SCALE,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            gesture.current = null;
            setDrag(null);
          }}
          aria-hidden
        >
          {!event?.rest && hit.y !== null && !drag && (
            <span
              className="pointer-events-none absolute flex size-6 -translate-x-1/2 items-center justify-center rounded-full bg-select text-select-foreground shadow-[0_2px_6px_oklch(0.3_0.1_256/0.35)]"
              style={{ left: (hit.x - hit.x0) * SCALE, top: (handleY - region.top) * SCALE }}
            >
              <ChevronsUpDown className="size-4" strokeWidth={2.4} />
            </span>
          )}
        </div>
      )}
      {drag && hit && system && (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute h-[10px] w-[14px] -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] rounded-[50%]",
              drag.problem ? "bg-destructive/70" : "bg-select/80",
            )}
            style={{ left: hit.x * SCALE, top: drag.y }}
          />
          <span
            className={cn(
              "pointer-events-none absolute z-20 -translate-x-1/2 rounded-full px-2.5 py-1 text-subhead font-semibold shadow-[0_4px_14px_oklch(0.2_0.01_255/0.22)]",
              drag.problem ? "bg-destructive text-white" : "bg-foreground text-background",
            )}
            style={{ left: hit.x * SCALE, top: Math.max(0, drag.y - 52) }}
          >
            {drag.problem ? "Вне диапазона" : pitchLabel(drag.pitch)}
          </span>
        </>
      )}
      {errorBubble}
    </div>
  );
}

/** Vertical band of one staff in a system: halfway to the neighbouring staff, or the system's edge. */
function staffRegion(sys: SystemBox, k: number) {
  const tops = sys.staffTops;
  const bottomLine = (i: number) => tops[i] + 4 * sys.spacing;
  return {
    top: k === 0 ? sys.top : (bottomLine(k - 1) + tops[k]) / 2,
    bottom: k === tops.length - 1 ? sys.bottom : (bottomLine(k) + tops[k + 1]) / 2,
  };
}

function nearestSystem(systems: SystemBox[], y: number) {
  const dist = (s: SystemBox) => Math.min(Math.abs(s.top - y), Math.abs(s.bottom - y));
  return systems.reduce<SystemBox | undefined>((best, s) => (dist(s) < (best ? dist(best) : Infinity) ? s : best), undefined);
}

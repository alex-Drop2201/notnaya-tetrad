import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { RANGE_ERRORS, stepName } from "@/lib/pitch";
import { cn } from "@/lib/utils";

// Piano for entering notes, one octave wide. It scrolls sideways by whole octaves: swipe
// it, or press a key and slide the finger. Only a tap on a key enters a note (the browser
// cancels the tap once the touch turns into a scroll). Arrows switch octaves too.

export const OCTAVE_NAMES: Record<number, string> = {
  3: "Малая октава",
  4: "Первая октава",
  5: "Вторая октава",
  6: "Третья октава",
  7: "Четвёртая октава",
};

const OCTAVES = [3, 4, 5, 6, 7];
const LOW = OCTAVES[0];
const HIGH = OCTAVES[OCTAVES.length - 1];

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** Black keys: pitch class and the white key they sit after. */
const BLACK = [
  { pc: 1, after: 0 },
  { pc: 3, after: 1 },
  { pc: 6, after: 3 },
  { pc: 8, after: 4 },
  { pc: 10, after: 5 },
];

const LOWEST = 55;
const HIGHEST = 100;
const outOfRange = (midi: number) => midi < LOWEST || midi > HIGHEST;

interface PianoProps {
  octave: number;
  onOctave: (octave: number) => void;
  activeMidi: number | null;
  onKey: (midi: number) => void;
  onOutOfRange: (message: string) => void;
}

export function Piano({ octave, onOctave, activeMidi, onKey, onOutOfRange }: PianoProps) {
  const scroller = useRef<HTMLDivElement>(null);
  /** Octave in view, as far as scrolling is concerned. */
  const inView = useRef<number | null>(null);

  // Scroll to `octave` when it changes from outside (arrows, a selected note), not while the user scrolls.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || inView.current === octave) return;
    const first = inView.current === null;
    inView.current = octave;
    el.scrollTo({ left: (octave - LOW) * el.clientWidth, behavior: first ? "instant" : "smooth" });
  }, [octave]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    const o = Math.min(HIGH, Math.max(LOW, LOW + Math.round(el.scrollLeft / el.clientWidth)));
    if (o !== inView.current) {
      inView.current = o;
      onOctave(o);
    }
  };

  const press = (midi: number) => {
    if (midi < LOWEST) return onOutOfRange(RANGE_ERRORS.low);
    if (midi > HIGHEST) return onOutOfRange(RANGE_ERRORS.high);
    onKey(midi);
  };

  const arrow =
    "-my-1 flex size-11 items-center justify-center rounded-full outline-none active:bg-fill disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center justify-between">
        <button type="button" onClick={() => onOctave(octave - 1)} disabled={octave <= LOW} aria-label="Октава ниже" className={arrow}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="text-footnote font-semibold text-muted-foreground" aria-live="polite">
          {OCTAVE_NAMES[octave]}
        </span>
        <button type="button" onClick={() => onOctave(octave + 1)} disabled={octave >= HIGH} aria-label="Октава выше" className={arrow}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar mt-1 flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        style={{ touchAction: "pan-x" }}
      >
        {OCTAVES.map((o) => (
          <Octave key={o} octave={o} activeMidi={activeMidi} onPress={press} />
        ))}
      </div>
    </div>
  );
}

function Octave({ octave, activeMidi, onPress }: { octave: number; activeMidi: number | null; onPress: (midi: number) => void }) {
  const c = 12 * (octave + 1);
  return (
    <div
      className="relative h-full w-full shrink-0 snap-start snap-always"
      role="group"
      aria-label={`Клавиши, ${OCTAVE_NAMES[octave].toLowerCase()}`}
    >
      <div className="flex h-full gap-[3px]">
        {WHITE.map((pc, step) => {
          const midi = c + pc;
          const active = activeMidi === midi;
          return (
            <button
              key={pc}
              type="button"
              onClick={() => onPress(midi)}
              aria-label={`${stepName(step)}${outOfRange(midi) ? ", вне диапазона скрипки" : ""}`}
              aria-pressed={active}
              className={cn(
                "flex flex-1 items-end justify-center rounded-b-md rounded-t-[3px] border border-border bg-paper pb-1.5 text-footnote text-ink/60 outline-none transition-colors active:brightness-90 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active && "border-select bg-select text-select-foreground active:bg-select",
                outOfRange(midi) && "opacity-35",
              )}
            >
              {stepName(step)}
            </button>
          );
        })}
      </div>
      {BLACK.map(({ pc, after }) => {
        const midi = c + pc;
        const active = activeMidi === midi;
        return (
          <button
            key={pc}
            type="button"
            onClick={() => onPress(midi)}
            aria-label={`${stepName(after)}-диез, он же ${stepName((after + 1) % 7)}-бемоль${outOfRange(midi) ? ", вне диапазона скрипки" : ""}`}
            aria-pressed={active}
            className={cn(
              "absolute top-0 h-[58%] w-[11%] -translate-x-1/2 rounded-b-[5px] bg-ink outline-none active:opacity-80 focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-select",
              outOfRange(midi) && "opacity-40",
            )}
            style={{ left: `${((after + 1) / 7) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

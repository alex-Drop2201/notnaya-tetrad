import { ChevronLeft, ChevronRight } from "lucide-react";
import { RANGE_ERRORS, stepName } from "@/lib/pitch";
import { cn } from "@/lib/utils";

// One-octave piano for entering notes. Arrows switch the octave.

export const OCTAVE_NAMES: Record<number, string> = {
  3: "Малая октава",
  4: "Первая октава",
  5: "Вторая октава",
  6: "Третья октава",
  7: "Четвёртая октава",
};

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
  const c = 12 * (octave + 1);
  const press = (midi: number) => {
    if (midi < LOWEST) return onOutOfRange(RANGE_ERRORS.low);
    if (midi > HIGHEST) return onOutOfRange(RANGE_ERRORS.high);
    onKey(midi);
  };
  const arrow =
    "flex size-9 items-center justify-center rounded-full outline-none active:bg-fill disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center justify-between">
        <button type="button" onClick={() => onOctave(octave - 1)} disabled={octave <= 3} aria-label="Октава ниже" className={arrow}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="text-footnote font-semibold text-muted-foreground" aria-live="polite">
          {OCTAVE_NAMES[octave]}
        </span>
        <button type="button" onClick={() => onOctave(octave + 1)} disabled={octave >= 7} aria-label="Октава выше" className={arrow}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="relative mt-1 flex-1" role="group" aria-label={`Клавиши, ${OCTAVE_NAMES[octave].toLowerCase()}`}>
        <div className="flex h-full gap-[3px]">
          {WHITE.map((pc, step) => {
            const midi = c + pc;
            const active = activeMidi === midi;
            return (
              <button
                key={pc}
                type="button"
                onClick={() => press(midi)}
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
              onClick={() => press(midi)}
              aria-label={`${stepName(after)}-диез, он же ${stepName((after + 1) % 7)}-бемоль${outOfRange(midi) ? ", вне диапазона скрипки" : ""}`}
              aria-pressed={active}
              className={cn(
                "absolute top-0 h-[58%] w-[9.5%] -translate-x-1/2 rounded-b-[5px] bg-ink outline-none active:opacity-80 focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-select",
                outOfRange(midi) && "opacity-40",
              )}
              style={{ left: `${((after + 1) / 7) * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

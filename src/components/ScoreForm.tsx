import type * as React from "react";
import { useMemo, useRef, useState } from "react";
import { FlatGlyph, NoteGlyph, SharpGlyph } from "@/components/glyphs";
import { Group, Row } from "@/components/layout";
import { ScorePreview } from "@/components/ScorePreview";
import { Stepper } from "@/components/Stepper";
import { Input } from "@/components/ui/input";
import { useWidth } from "@/hooks/useWidth";
import { timeLabel } from "@/lib/format";
import { keyTitle } from "@/lib/pitch";
import { createScore } from "@/lib/score";
import type { TimeSignature } from "@/lib/types";
import { cn } from "@/lib/utils";

// Form for a new part and for the part settings: title and credits, key, time, tempo.

export interface ScoreFormValue {
  title: string;
  composer: string;
  arranger: string;
  keyFifths: number;
  time: TimeSignature;
  tempo: number;
  measures: number;
}

const RELATIVE_MINOR: Record<number, string> = {
  [-7]: "ля-бемоль минор",
  [-6]: "ми-бемоль минор",
  [-5]: "си-бемоль минор",
  [-4]: "фа минор",
  [-3]: "до минор",
  [-2]: "соль минор",
  [-1]: "ре минор",
  0: "ля минор",
  1: "ми минор",
  2: "си минор",
  3: "фа-диез минор",
  4: "до-диез минор",
  5: "соль-диез минор",
  6: "ре-диез минор",
  7: "ля-диез минор",
};

const TIMES: { label: string; aria: string; time: TimeSignature }[] = [
  { label: "2/4", aria: "две четверти", time: { beats: 2, beatType: 4 } },
  { label: "3/4", aria: "три четверти", time: { beats: 3, beatType: 4 } },
  { label: "4/4", aria: "четыре четверти", time: { beats: 4, beatType: 4 } },
  { label: "C", aria: "четыре четверти, знак C", time: { beats: 4, beatType: 4, symbol: "common" } },
  { label: "¢", aria: "алла бреве", time: { beats: 2, beatType: 2, symbol: "cut" } },
  { label: "3/8", aria: "три восьмых", time: { beats: 3, beatType: 8 } },
  { label: "6/8", aria: "шесть восьмых", time: { beats: 6, beatType: 8 } },
];

const sameTime = (a: TimeSignature, b: TimeSignature) =>
  a.beats === b.beats && a.beatType === b.beatType && (a.symbol ?? "") === (b.symbol ?? "");

interface ScoreFormProps {
  value: ScoreFormValue;
  onChange: (value: ScoreFormValue) => void;
  mode: "create" | "edit";
  titleError?: boolean;
  /** The time signature differs from the saved one: the measures will be laid out again. */
  timeChanged?: boolean;
}

export function ScoreForm({ value, onChange, mode, titleError, timeChanged }: ScoreFormProps) {
  const set = <K extends keyof ScoreFormValue>(key: K, v: ScoreFormValue[K]) => onChange({ ...value, [key]: v });
  const preset = TIMES.find((t) => sameTime(t.time, value.time));
  const [customTime, setCustomTime] = useState(!preset);
  const titleRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () =>
      createScore(
        { title: "", tempo: value.tempo, keyFifths: value.keyFifths, time: value.time, measures: 2 },
        "2026-01-01T00:00:00.000Z",
      ),
    [value.tempo, value.keyFifths, value.time],
  );
  const [previewRef, previewWidth] = useWidth();

  return (
    <div className="space-y-6 pb-6">
      <div className="px-4">
        <div ref={previewRef} className="min-h-[100px] overflow-hidden rounded-lg bg-paper px-3 pb-1 shadow-paper" aria-hidden>
          {previewWidth > 0 && <ScorePreview score={preview} width={previewWidth - 24} scale={0.8} />}
        </div>
        <p className="mt-2 text-center text-footnote text-muted-foreground">
          {keyTitle(value.keyFifths)} · {timeLabel(value.time)} ·{" "}
          <NoteGlyph base={4} className="-mr-1.5 inline-block size-4 align-[-0.25em]" />= {value.tempo}
        </p>
      </div>

      <Group title="Песня" footer={titleError ? undefined : "Название, авторы и партия попадут в шапку PDF."}>
        <Row label="Название" className="pr-4">
          <Input
            ref={titleRef}
            autoFocus={mode === "create"}
            value={value.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Например, «Улыбка»"
            aria-invalid={titleError || undefined}
            aria-describedby={titleError ? "title-error" : undefined}
            className="text-right"
            enterKeyHint="next"
          />
        </Row>
        <Row label="Автор музыки">
          <Input
            value={value.composer}
            onChange={(e) => set("composer", e.target.value)}
            placeholder="Необязательно"
            className="text-right"
          />
        </Row>
        <Row label="Партию написал">
          <Input
            value={value.arranger}
            onChange={(e) => set("arranger", e.target.value)}
            placeholder="Необязательно"
            className="text-right"
          />
        </Row>
      </Group>
      {titleError && (
        <p id="title-error" className="-mt-4 px-8 text-footnote text-destructive">
          Введите название песни
        </p>
      )}

      <Group title="Тональность" footer={`${capitalize(keyTitle(value.keyFifths))} или ${RELATIVE_MINOR[value.keyFifths]}`}>
        <div className="space-y-2 p-3">
          <KeyButton fifths={0} selected={value.keyFifths === 0} onPick={(f) => set("keyFifths", f)} wide />
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <KeyButton key={n} fifths={n} selected={value.keyFifths === n} onPick={(f) => set("keyFifths", f)} />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <KeyButton key={n} fifths={-n} selected={value.keyFifths === -n} onPick={(f) => set("keyFifths", f)} />
            ))}
          </div>
        </div>
      </Group>

      <Group
        title="Размер"
        footer={timeChanged ? "Такты перестроятся под новый размер. Ноты сохранятся, длинные разделятся лигой." : undefined}
      >
        <div className="grid grid-cols-4 gap-1.5 p-3">
          {TIMES.map((t) => (
            <Choice
              key={t.label}
              selected={!customTime && sameTime(t.time, value.time)}
              onClick={() => {
                setCustomTime(false);
                set("time", t.time);
              }}
              aria-label={t.aria}
            >
              <span className={cn("font-sheet text-title3 font-bold", t.label.includes("/") && "text-body")}>{t.label}</span>
            </Choice>
          ))}
          <Choice selected={customTime} onClick={() => setCustomTime(true)} aria-label="другой размер">
            <span className="text-subhead">Другой</span>
          </Choice>
        </div>
        {customTime && (
          <>
            <Row label="Долей в такте">
              <Stepper
                label="Долей в такте"
                value={value.time.beats}
                min={1}
                max={12}
                onChange={(beats) => set("time", { beats, beatType: value.time.beatType })}
              />
            </Row>
            <Row label="Длительность доли">
              <div className="flex overflow-hidden rounded-md bg-fill p-0.5">
                {[2, 4, 8].map((beatType) => (
                  <button
                    key={beatType}
                    type="button"
                    onClick={() => set("time", { beats: value.time.beats, beatType })}
                    aria-pressed={value.time.beatType === beatType}
                    className={cn(
                      "h-8 min-w-12 rounded-[7px] px-2 text-subhead outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      value.time.beatType === beatType && "bg-surface-raised font-semibold shadow-[0_1px_3px_oklch(0.2_0.01_255/0.14)]",
                    )}
                  >
                    {beatType === 2 ? "половинная" : beatType === 4 ? "четверть" : "восьмая"}
                  </button>
                ))}
              </div>
            </Row>
          </>
        )}
      </Group>

      <Group title={mode === "create" ? "Темп и длина" : "Темп"}>
        <Row
          label={
            <span className="inline-flex items-center">
              Темп, <NoteGlyph base={4} className="mx-0.5 size-5" aria-label="четвертей" /> в минуту
            </span>
          }
        >
          <Stepper label="Темп" value={value.tempo} min={30} max={220} step={2} onChange={(v) => set("tempo", v)} />
        </Row>
        {mode === "create" && (
          <Row label="Тактов">
            <Stepper label="Тактов" value={value.measures} min={1} max={200} onChange={(v) => set("measures", v)} />
          </Row>
        )}
      </Group>
      {mode === "create" && (
        <p className="-mt-4 px-8 text-footnote text-muted-foreground">
          Если тактов не хватит, новые добавятся сами, когда вы допишете последний.
        </p>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Choice({ selected, className, children, ...props }: React.ComponentProps<"button"> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex h-11 items-center justify-center gap-0.5 rounded-md bg-fill text-foreground outline-none transition-colors active:bg-fill-strong focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-primary text-primary-foreground active:bg-primary-pressed",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function KeyButton({
  fifths,
  selected,
  onPick,
  wide,
}: {
  fifths: number;
  selected: boolean;
  onPick: (fifths: number) => void;
  wide?: boolean;
}) {
  const count = Math.abs(fifths);
  const Sign = fifths > 0 ? SharpGlyph : FlatGlyph;
  return (
    <Choice selected={selected} onClick={() => onPick(fifths)} aria-label={keyTitle(fifths)} className={wide ? "w-full" : "px-0"}>
      {fifths === 0 ? (
        <span className="text-subhead">Без знаков · до мажор</span>
      ) : (
        <>
          <span className="tabular text-subhead font-semibold">{count}</span>
          <Sign className="size-[18px]" />
        </>
      )}
    </Choice>
  );
}

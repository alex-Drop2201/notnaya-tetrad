import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CopyPlus, Delete, Plus, Trash, TriangleAlert, Undo2, X } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import {
  DotGlyph,
  FlatGlyph,
  NaturalGlyph,
  NoteGlyph,
  RepeatEndGlyph,
  RepeatStartGlyph,
  RestGlyph,
  SharpGlyph,
  TieGlyph,
} from "@/components/glyphs";
import { DURATION_NAMES } from "@/lib/durations";
import { fromMidi, midiOf, pitchLabel } from "@/lib/pitch";
import { prefs } from "@/lib/storage";
import type { Base } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Piano } from "./Piano";
import type { Editor, EditorNotice } from "./useEditor";

// Bottom sheet of the editor: message line with prev/next/delete, note values, and
// four tool tabs (keys, signs, finger, measure).

export type ToolTab = "keys" | "signs" | "finger" | "measure";

const TABS: { id: ToolTab; label: string }[] = [
  { id: "keys", label: "Клавиши" },
  { id: "signs", label: "Знаки" },
  { id: "finger", label: "Палец" },
  { id: "measure", label: "Такт" },
];

const BASES: Base[] = [1, 2, 4, 8, 16];
const OCTAVE_KEY = "nt.octave";
const VALUE_NAMES: Record<Base, string> = {
  1: "целая",
  2: "половинная",
  4: "четверть",
  8: "восьмая",
  16: "шестнадцатая",
};

interface ToolbarProps {
  editor: Editor;
  tab: ToolTab;
  onTab: (tab: ToolTab) => void;
  onUndo: () => void;
}

export function Toolbar({ editor, tab, onTab, onUndo }: ToolbarProps) {
  const { selected, cursor, value, notice, actions, score } = editor;
  const isNote = !!selected && !selected.rest;
  const [octave, setOctaveState] = useState(() => Number(prefs.get(OCTAVE_KEY)) || 4);
  const setOctave = (o: number) => {
    setOctaveState(o);
    prefs.set(OCTAVE_KEY, String(o));
  };
  useEffect(() => {
    if (selected?.pitch) setOctaveState(selected.pitch.octave);
  }, [selected?.pitch?.octave, selected?.pitch]);

  const status = selected
    ? `Такт ${cursor.m + 1} · ${
        selected.rest
          ? selected.full
            ? "пустой такт"
            : `пауза, ${VALUE_NAMES[selected.base]}${selected.dots ? " с точкой" : ""}`
          : `${pitchLabel(selected.pitch!)}, ${VALUE_NAMES[selected.base]}${selected.dots ? " с точкой" : ""}`
      }`
    : "";

  // A "fix" notice stays for 6 s; errors stay until the next action.
  const [shown, setShown] = useState<EditorNotice | null>(notice);
  useEffect(() => {
    setShown(notice);
    if (notice?.kind !== "fix") return;
    const t = window.setTimeout(() => setShown(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const accidental = selected?.pitch?.explicit ? selected.pitch.alter : null;

  return (
    <div className="pb-safe relative z-10 rounded-t-xl bg-surface shadow-sheet">
      <div className="flex h-12 items-center gap-1 border-b border-border/70 px-1.5">
        {!shown && (
          <IconButton label="Предыдущая нота" onClick={() => actions.move(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
        )}
        <div className="min-w-0 flex-1 px-1" aria-live="polite">
          {shown ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-footnote",
                shown.kind === "fix" ? "bg-warning-soft text-foreground" : "bg-fill text-foreground",
              )}
            >
              <TriangleAlert
                className={cn("size-4 shrink-0", shown.kind === "fix" ? "text-warning" : "text-destructive")}
                aria-hidden
              />
              <span className="flex-1 leading-tight">{shown.text}</span>
              {shown.kind === "fix" ? (
                <button
                  type="button"
                  onClick={onUndo}
                  className="shrink-0 font-semibold text-foreground underline underline-offset-2 outline-none active:opacity-60"
                >
                  Отменить
                </button>
              ) : (
                <button
                  type="button"
                  onClick={actions.dismissNotice}
                  aria-label="Скрыть"
                  className="shrink-0 outline-none active:opacity-60"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ) : (
            <p className="truncate text-center text-subhead text-muted-foreground">{status}</p>
          )}
        </div>
        {!shown && (
          <>
            <IconButton label="Следующая нота" onClick={() => actions.move(1)}>
              <ChevronRight className="size-5" />
            </IconButton>
            <IconButton
              label={isNote ? "Удалить ноту" : "Удалить паузу"}
              onClick={actions.remove}
              disabled={!selected || (selected.rest && (selected.auto || selected.full))}
            >
              <Delete className="size-5" />
            </IconButton>
          </>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 pt-2" role="group" aria-label="Длительность">
        {BASES.map((b) => (
          <ValueButton key={b} label={DURATION_NAMES[b]} pressed={value.base === b} onClick={() => actions.chooseValue(b)}>
            <NoteGlyph base={b} className="size-7" />
          </ValueButton>
        ))}
        <ValueButton label="Точка" pressed={value.dots === 1} onClick={actions.toggleDot} disabled={value.base === 16}>
          <DotGlyph className="size-7" />
        </ValueButton>
        <ValueButton label="Поставить паузу" onClick={actions.enterRest}>
          <RestGlyph className="size-7" />
        </ValueButton>
      </div>

      <div className="px-3 pt-2.5">
        <div className="grid grid-cols-4 rounded-[9px] bg-fill p-0.5" role="tablist" aria-label="Инструменты">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={cn(
                "h-8 rounded-[7px] text-footnote outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id
                  ? "bg-surface-raised font-semibold text-foreground shadow-[0_1px_3px_oklch(0.2_0.01_255/0.14)]"
                  : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[148px] px-3 pt-2 pb-2.5" role="tabpanel">
        {tab === "keys" && (
          <Piano
            octave={octave}
            onOctave={setOctave}
            activeMidi={selected?.pitch ? midiOf(selected.pitch) : null}
            onKey={(midi) => actions.enterNote(fromMidi(midi, score.keyFifths))}
            onOutOfRange={actions.error}
          />
        )}
        {tab === "signs" && (
          <ToolGrid hint={isNote ? null : "Выберите ноту на нотном стане"}>
            <Tool label="Диез" disabled={!isNote} pressed={accidental === 1} onClick={() => actions.accidental(1)}>
              <SharpGlyph />
            </Tool>
            <Tool label="Бемоль" disabled={!isNote} pressed={accidental === -1} onClick={() => actions.accidental(-1)}>
              <FlatGlyph />
            </Tool>
            <Tool label="Бекар" disabled={!isNote} pressed={accidental === 0} onClick={() => actions.accidental(0)}>
              <NaturalGlyph />
            </Tool>
            <Tool label="Выше" disabled={!isNote} onClick={() => actions.stepPitch(1)}>
              <ArrowUp />
            </Tool>
            <Tool label="Ниже" disabled={!isNote} onClick={() => actions.stepPitch(-1)}>
              <ArrowDown />
            </Tool>
            <Tool label="Лига" disabled={!isNote} pressed={!!selected?.tie} onClick={actions.tie}>
              <TieGlyph />
            </Tool>
          </ToolGrid>
        )}
        {tab === "finger" && (
          <div className="flex h-full flex-col">
            <div className="grid flex-1 grid-cols-5 gap-1.5">
              {[1, 2, 3, 4].map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={!isNote}
                  aria-pressed={selected?.finger === f}
                  aria-label={`Палец ${f}`}
                  onClick={() => actions.finger(f)}
                  className={cn(
                    "rounded-lg bg-fill font-sheet text-[28px] font-bold text-foreground outline-none transition-colors active:bg-fill-strong disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-ring",
                    selected?.finger === f && "bg-primary text-primary-foreground active:bg-primary-pressed",
                  )}
                >
                  {f}
                </button>
              ))}
              <button
                type="button"
                disabled={!isNote || !selected?.finger}
                onClick={() => actions.finger(null)}
                className="flex flex-col items-center justify-center gap-1 rounded-lg bg-fill text-caption text-foreground outline-none active:bg-fill-strong disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-5" aria-hidden />
                Убрать
              </button>
            </div>
            <p className="pt-2 text-center text-footnote text-muted-foreground">
              {isNote ? "Цифра встанет над нотой. Тот же палец ещё раз — убрать." : "Выберите ноту на нотном стане"}
            </p>
          </div>
        )}
        {tab === "measure" && (
          <ToolGrid hint={null}>
            <Tool label="Добавить" onClick={actions.addMeasure}>
              <Plus />
            </Tool>
            <Tool label="Повторить" onClick={actions.duplicateMeasure}>
              <CopyPlus />
            </Tool>
            <Tool label="Удалить" onClick={actions.deleteMeasure} tone="destructive">
              <Trash />
            </Tool>
            <Tool label="Начало повтора" pressed={!!score.measures[cursor.m]?.repeatStart} onClick={() => actions.repeat("start")}>
              <RepeatStartGlyph />
            </Tool>
            <Tool label="Конец повтора" pressed={!!score.measures[cursor.m]?.repeatEnd} onClick={() => actions.repeat("end")}>
              <RepeatEndGlyph />
            </Tool>
            <Tool label="Отменить" onClick={onUndo} disabled={!editor.canUndo}>
              <Undo2 />
            </Tool>
          </ToolGrid>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, children, ...props }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground outline-none active:bg-fill disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring"
      {...props}
    >
      {children}
    </button>
  );
}

function ValueButton({ label, pressed, children, ...props }: React.ComponentProps<"button"> & { label: string; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "flex h-12 items-center justify-center rounded-lg text-foreground outline-none transition-colors active:bg-fill-strong disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "bg-primary text-primary-foreground active:bg-primary-pressed" : "bg-fill",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function ToolGrid({ hint, children }: { hint: string | null; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-1.5">{children}</div>
      {hint && <p className="pt-1.5 text-center text-footnote text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Tool({
  label,
  pressed,
  tone,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string; pressed?: boolean; tone?: "destructive" }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg bg-fill px-2 text-footnote font-medium text-foreground outline-none transition-colors active:bg-fill-strong disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0",
        pressed && "bg-primary text-primary-foreground active:bg-primary-pressed",
        tone === "destructive" && !pressed && "text-destructive",
      )}
      {...props}
    >
      {children}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

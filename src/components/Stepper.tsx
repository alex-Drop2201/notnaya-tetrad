import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  format?: (value: number) => string;
  className?: string;
}

/** Value with − and + buttons, like the iOS stepper. */
export function Stepper({ value, min, max, step = 1, onChange, label, format = String, className }: StepperProps) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const button =
    "flex h-9 w-12 items-center justify-center outline-none active:bg-fill-strong disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="tabular min-w-[3ch] text-right text-body text-foreground" aria-live="polite">
        {format(value)}
      </span>
      <div className="flex overflow-hidden rounded-md bg-fill">
        <button type="button" className={button} aria-label={`${label}: меньше`} disabled={value <= min} onClick={() => set(value - step)}>
          <Minus className="size-5" aria-hidden />
        </button>
        <span className="my-2 w-px bg-border" aria-hidden />
        <button type="button" className={button} aria-label={`${label}: больше`} disabled={value >= max} onClick={() => set(value + step)}>
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

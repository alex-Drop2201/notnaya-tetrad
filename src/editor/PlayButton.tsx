import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Play button with two actions: a tap plays from the selected note, holding it for
// HOLD_MS plays from the beginning. The button fills up while held. While playing, a tap stops.

const HOLD_MS = 3000;

interface PlayButtonProps {
  playing: boolean;
  /** Called on press, inside the user gesture (iOS starts audio only then). */
  onPressStart: () => void;
  onPlay: (fromStart: boolean) => void;
  onStop: () => void;
}

export function PlayButton({ playing, onPressStart, onPlay, onStop }: PlayButtonProps) {
  const [holding, setHolding] = useState(false);
  const [held, setHeld] = useState(false);
  const timer = useRef(0);
  const fired = useRef(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => cancel, []);
  useEffect(() => {
    if (!held) return;
    const t = window.setTimeout(() => setHeld(false), 500);
    return () => window.clearTimeout(t);
  }, [held]);

  return (
    <button
      type="button"
      aria-label={playing ? "Остановить" : "Слушать с выбранной ноты. Удерживайте 3 секунды — с начала"}
      title={playing ? "Остановить" : "Слушать с выбранной ноты · удерживать — с начала"}
      aria-pressed={playing}
      className="relative inline-flex size-11 shrink-0 touch-manipulation select-none items-center justify-center overflow-hidden rounded-full text-foreground outline-none [-webkit-touch-callout:none] active:bg-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (playing || e.button !== 0) return;
        onPressStart();
        fired.current = false;
        setHolding(true);
        timer.current = window.setTimeout(() => {
          fired.current = true;
          setHolding(false);
          setHeld(true);
          onPlay(true);
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        if (playing) onStop();
        else onPlay(false);
      }}
    >
      <span
        aria-hidden
        data-progress
        className={cn(
          "absolute inset-0 origin-center rounded-full bg-select-soft",
          holding ? "scale-100 transition-transform ease-linear" : "scale-0 transition-none",
          held && "scale-100 bg-select/25 transition-colors duration-500",
        )}
        style={holding ? { transitionDuration: `${HOLD_MS}ms` } : undefined}
      />
      {playing ? <Square className="relative size-5 fill-current" /> : <Play className="relative size-6 fill-current" />}
    </button>
  );
}

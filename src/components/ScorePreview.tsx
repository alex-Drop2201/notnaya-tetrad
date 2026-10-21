import { useEffect, useRef } from "react";
import { renderScore, useStaffColors } from "@/lib/engrave";
import { visibleMeasures } from "@/lib/score";
import type { Score } from "@/lib/types";

/** First line of a score, small, for cards and the settings preview. */
export function ScorePreview({ score, width, scale = 0.62 }: { score: Score; width: number; scale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useStaffColors();
  useEffect(() => {
    if (!ref.current || width <= 0) return;
    const measures = visibleMeasures(score).slice(0, 4);
    renderScore(ref.current, score, measures, scale, {
      width: width / scale,
      maxPerSystem: 4,
      topPad: 10,
      final: visibleMeasures(score).length <= 4,
      colors,
    });
  }, [score, width, scale, colors]);
  return <div ref={ref} aria-hidden className="pointer-events-none overflow-hidden [&_svg]:block" />;
}

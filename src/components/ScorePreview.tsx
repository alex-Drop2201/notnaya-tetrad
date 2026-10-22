import { useEffect, useRef } from "react";
import { renderScore, useStaffColors } from "@/lib/engrave";
import { visibleMeasures } from "@/lib/score";
import type { Score } from "@/lib/types";

/**
 * First line of a score, small, for cards and the settings preview. With `height`, the
 * staff is kept in view at that height: very high or low notes are cut at the edge
 * rather than pushing the staff out of the box.
 */
export function ScorePreview({ score, width, scale = 0.62, height }: { score: Score; width: number; scale?: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const colors = useStaffColors();
  useEffect(() => {
    if (!ref.current || width <= 0) return;
    const measures = visibleMeasures(score).slice(0, 4);
    const { layout } = renderScore(ref.current, score, measures, scale, {
      width: width / scale,
      maxPerSystem: 4,
      topPad: 10,
      final: visibleMeasures(score).length <= 4,
      colors,
    });
    const svg = ref.current.querySelector("svg");
    const staff = layout.systems[0];
    if (svg && staff && height) {
      // Staff middle at 58% of the box, leaving room for the tempo mark above it.
      const shift = Math.min(0, height * 0.58 - (staff.staffTop + 2 * staff.spacing) * scale);
      svg.style.marginTop = `${shift}px`;
    }
  }, [score, width, scale, colors, height]);
  return <div ref={ref} aria-hidden className="pointer-events-none overflow-hidden [&_svg]:block" />;
}

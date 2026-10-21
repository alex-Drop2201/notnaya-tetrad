import { keyTitle } from "./pitch";
import { visibleMeasures } from "./score";
import type { Score, TimeSignature } from "./types";

export function timeLabel(time: TimeSignature) {
  return time.symbol === "common" ? "4/4" : time.symbol === "cut" ? "2/2" : `${time.beats}/${time.beatType}`;
}

export function measuresLabel(n: number) {
  const d = n % 10;
  const dd = n % 100;
  const word = d === 1 && dd !== 11 ? "такт" : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? "такта" : "тактов";
  return `${n} ${word}`;
}

/** «ре мажор · 4/4 · 12 тактов». */
export function scoreSummary(score: Score) {
  return [keyTitle(score.keyFifths), timeLabel(score.time), measuresLabel(visibleMeasures(score).length)].join(" · ");
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function formatDate(iso: string, now = new Date()) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Сегодня, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${time}`;
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
}

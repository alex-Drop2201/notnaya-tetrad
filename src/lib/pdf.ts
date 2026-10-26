import { firstStaffMiddles, paginate, prepareLayout, renderPage, type EngraveOptions } from "./engrave";
import { staffView, visibleStaves } from "./score";
import type { Score, StaffIndex } from "./types";

// A4 PDF: title centered, composer and arranger in the top right corner, part name before
// the first system, title and page number in the footer of the following pages. A score
// with two staves prints both together, each name before its staff, or one staff alone.

/** What to print of a score with two staves. */
export type PdfChoice = "both" | StaffIndex;

const fontRegularUrl = new URL("../assets/fonts/PTSerif-Regular.ttf", import.meta.url).href;
const fontBoldUrl = new URL("../assets/fonts/PTSerif-Bold.ttf", import.meta.url).href;

/** A4 in points. */
const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = { x: 42, top: 46, bottom: 46 };
/** Staff size on paper relative to the engraving units. */
const SCALE = 0.6;
const SYSTEM_GAP = 14;
const TITLE_LINE = 26;

async function fetchBase64(url: string) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}

function pdfFilename(score: Score) {
  const title =
    score.title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ") || "Партия";
  return `${title} — ${score.second ? "две партии" : score.partName}.pdf`;
}

export async function exportPdf(original: Score, which: PdfChoice = "both") {
  // One staff alone prints as a part of its own, under its name.
  const score = !original.second || which === "both" ? original : { ...staffView(original, which), second: undefined };
  const names = score.second ? [score.partName, score.second.name] : [score.partName];
  const [{ jsPDF }, { svg2pdf }, regular, bold] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
    fetchBase64(fontRegularUrl),
    fetchBase64(fontBoldUrl),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  doc.addFileToVFS("PTSerif-Regular.ttf", regular);
  doc.addFont("PTSerif-Regular.ttf", "PTSerif", "normal");
  doc.addFileToVFS("PTSerif-Bold.ttf", bold);
  doc.addFont("PTSerif-Bold.ttf", "PTSerif", "bold");
  doc.setProperties({ title: score.title, subject: names.join(", "), creator: "Нотная тетрадь" });

  const contentW = PAGE.w - MARGIN.x * 2;
  const contentH = PAGE.h - MARGIN.top - MARGIN.bottom;
  const width = contentW / SCALE;
  const height = contentH / SCALE;
  doc.setFont("PTSerif", "normal");
  doc.setFontSize(10.5);
  const partNameWidth = Math.max(...names.map((n) => doc.getTextWidth(n))) + 8;
  const staves = visibleStaves(score);
  const black = "#000000";
  const opts: EngraveOptions = {
    width,
    firstIndent: partNameWidth / SCALE,
    systemGap: SYSTEM_GAP,
    maxPerSystem: 4,
    justifyLast: 0.3,
    colors: { ink: black },
  };
  const systems = prepareLayout(score, staves, opts);
  // A long title wraps onto more lines instead of running off the page.
  doc.setFont("PTSerif", "bold");
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(score.title, contentW - 40) as string[];
  const titleExtra = (titleLines.length - 1) * TITLE_LINE;
  // Top right, as on printed parts: the composer, then who wrote this part.
  const credits = [score.composer, score.arranger && `Партия: ${score.arranger}`].filter(Boolean) as string[];
  const headerHeight = (34 + titleExtra + (credits.length ? credits.length * 13 + 6 : 8)) / SCALE;
  const pages = paginate(systems, height, headerHeight, SYSTEM_GAP);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:2000px;pointer-events:none;opacity:0";
  document.body.appendChild(host);
  try {
    for (let page = 0; page < pages.systems.length; page++) {
      if (page > 0) doc.addPage("a4", "portrait");
      const top = page === 0 ? headerHeight : 0;
      const svg = renderPage(host, score, staves, systems, pages.systems[page], opts, { width, height }, top);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      await svg2pdf(svg, doc, { x: MARGIN.x, y: MARGIN.top, width: contentW, height: contentH });
      if (page === 0) {
        doc.setTextColor(0, 0, 0);
        doc.setFont("PTSerif", "bold");
        doc.setFontSize(22);
        titleLines.forEach((line, i) => doc.text(line, PAGE.w / 2, MARGIN.top + 20 + i * TITLE_LINE, { align: "center" }));
        doc.setFont("PTSerif", "normal");
        doc.setFontSize(10);
        credits.forEach((line, i) =>
          doc.text(line, PAGE.w - MARGIN.x, MARGIN.top + 40 + titleExtra + i * 13, { align: "right" }),
        );
        doc.setFontSize(10.5);
        firstStaffMiddles(systems).forEach((middle, k) =>
          doc.text(names[k], MARGIN.x, MARGIN.top + (headerHeight + middle) * SCALE + 3.5),
        );
      } else {
        doc.setFont("PTSerif", "normal");
        doc.setFontSize(9);
        doc.text(`${score.title} — ${page + 1}`, PAGE.w / 2, PAGE.h - MARGIN.bottom / 2, { align: "center" });
      }
    }
  } finally {
    host.remove();
  }
  return { blob: doc.output("blob"), pages: pages.systems.length, filename: pdfFilename(score) };
}

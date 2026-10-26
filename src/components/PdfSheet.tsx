import { FileText, LoaderCircle, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { openBlob, shareFile } from "@/lib/files";
import { exportPdf, type PdfChoice } from "@/lib/pdf";
import type { Score } from "@/lib/types";
import { cn } from "@/lib/utils";

type State =
  | { kind: "building" }
  | { kind: "ready"; pdf: Awaited<ReturnType<typeof exportPdf>> }
  | { kind: "failed" };

function pagesLabel(n: number) {
  return n === 1 ? "1 страница" : n < 5 ? `${n} страницы` : `${n} страниц`;
}

/**
 * Bottom sheet that builds the PDF and offers to share or print it. Open while `score` is set.
 * For a score with two staves it asks what to print: both together or one of them.
 */
export function PdfSheet({ score, onClose: close }: { score: Score | null; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "building" });
  const [attempt, setAttempt] = useState(0);
  const [which, setWhich] = useState<PdfChoice>("both");
  const onClose = () => {
    setWhich("both");
    close();
  };
  useEffect(() => {
    if (!score) return;
    let alive = true;
    setState({ kind: "building" });
    exportPdf(score, which).then(
      (pdf) => alive && setState({ kind: "ready", pdf }),
      (e) => {
        console.error(e);
        if (alive) setState({ kind: "failed" });
      },
    );
    return () => {
      alive = false;
    };
  }, [score, attempt, which]);
  const choices: { id: PdfChoice; label: string }[] = score?.second
    ? [
        { id: "both", label: "Обе партии" },
        { id: 0, label: score.partName },
        { id: 1, label: score.second.name },
      ]
    : [];

  return (
    <Drawer open={!!score} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="rounded-t-xl bg-surface pb-safe">
        <DrawerHeader className="pb-2 text-center">
          <DrawerTitle className="text-body">PDF для печати</DrawerTitle>
          <DrawerDescription className="text-footnote">A4, книжная ориентация</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">
          {choices.length > 0 && (
            <div className="mb-3 grid grid-cols-3 rounded-[9px] bg-fill p-0.5" role="radiogroup" aria-label="Что напечатать">
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={which === c.id}
                  onClick={() => setWhich(c.id)}
                  className={cn(
                    "h-10 truncate rounded-[7px] px-1.5 text-footnote outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    which === c.id
                      ? "bg-surface-raised font-semibold text-foreground shadow-[0_1px_3px_oklch(0.2_0.01_255/0.14)]"
                      : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 rounded-lg bg-fill px-4 py-3.5">
            <FileText className="size-8 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{state.kind === "ready" ? state.pdf.filename : score?.title}</p>
              <p className="text-footnote text-muted-foreground" aria-live="polite">
                {state.kind === "building" && "Готовим ноты к печати…"}
                {state.kind === "ready" &&
                  `${pagesLabel(state.pdf.pages)} · ${Math.max(1, Math.round(state.pdf.blob.size / 1024))} КБ`}
                {state.kind === "failed" && "Не получилось собрать PDF"}
              </p>
            </div>
            {state.kind === "building" && <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <div className="mt-4 grid gap-2">
            {state.kind === "failed" ? (
              <Button size="lg" onClick={() => setAttempt((n) => n + 1)}>
                Попробовать ещё раз
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  disabled={state.kind !== "ready"}
                  onClick={async () => {
                    if (state.kind !== "ready" || !score) return;
                    const result = await shareFile(state.pdf.blob, state.pdf.filename, score.title);
                    if (result === "downloaded") toast.success("PDF сохранён в загрузки");
                    if (result !== "cancelled") onClose();
                  }}
                >
                  <Share /> Поделиться или сохранить
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={state.kind !== "ready"}
                  onClick={() => state.kind === "ready" && openBlob(state.pdf.blob)}
                >
                  Открыть и распечатать
                </Button>
              </>
            )}
          </div>
          <p className="mt-3 px-2 text-center text-footnote text-muted-foreground">
            В меню «Поделиться» есть «Сохранить в Файлы», Google Диск и печать.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

import { FileText, LoaderCircle, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { openBlob, shareFile } from "@/lib/files";
import { exportPdf } from "@/lib/pdf";
import type { Score } from "@/lib/types";

type State =
  | { kind: "building" }
  | { kind: "ready"; pdf: Awaited<ReturnType<typeof exportPdf>> }
  | { kind: "failed" };

function pagesLabel(n: number) {
  return n === 1 ? "1 страница" : n < 5 ? `${n} страницы` : `${n} страниц`;
}

/** Bottom sheet that builds the PDF and offers to share or print it. Open while `score` is set. */
export function PdfSheet({ score, onClose }: { score: Score | null; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "building" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!score) return;
    let alive = true;
    setState({ kind: "building" });
    exportPdf(score).then(
      (pdf) => alive && setState({ kind: "ready", pdf }),
      (e) => {
        console.error(e);
        if (alive) setState({ kind: "failed" });
      },
    );
    return () => {
      alive = false;
    };
  }, [score, attempt]);

  return (
    <Drawer open={!!score} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="rounded-t-xl bg-surface pb-safe">
        <DrawerHeader className="pb-2 text-center">
          <DrawerTitle className="text-body">PDF для печати</DrawerTitle>
          <DrawerDescription className="text-footnote">A4, книжная ориентация</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">
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

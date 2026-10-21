import { Copy, Download, Ellipsis, FileText, Plus, Trash, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AboutSheet } from "@/components/AboutSheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LargeTitle, NavBar } from "@/components/layout";
import { PdfSheet } from "@/components/PdfSheet";
import { ScorePreview } from "@/components/ScorePreview";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWidth } from "@/hooks/useWidth";
import { shareFile } from "@/lib/files";
import { formatDate, scoreSummary } from "@/lib/format";
import { navigate, paths } from "@/lib/router";
import { uid } from "@/lib/score";
import { deleteScore, exportBackup, importBackup, listScores, saveScore } from "@/lib/storage";
import type { Score } from "@/lib/types";

export function Library() {
  const [scores, setScores] = useState<Score[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [toDelete, setToDelete] = useState<Score | null>(null);
  const [pdfScore, setPdfScore] = useState<Score | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const reload = useCallback(() => {
    listScores().then(setScores, () => setFailed(true));
  }, []);
  useEffect(reload, [reload]);

  const duplicate = async (score: Score) => {
    const now = new Date().toISOString();
    await saveScore({ ...structuredClone(score), id: uid(), title: `${score.title} (копия)`, createdAt: now, updatedAt: now });
    reload();
    toast.success("Копия создана");
  };

  const remove = async (score: Score) => {
    await deleteScore(score.id);
    setToDelete(null);
    reload();
    toast("Партия удалена", {
      action: {
        label: "Вернуть",
        onClick: async () => {
          await saveScore(score);
          reload();
        },
      },
    });
  };

  const backup = async () => {
    const result = await shareFile(
      await exportBackup(),
      `Нотная тетрадь — копия ${new Date().toISOString().slice(0, 10)}.json`,
      "Копия партий",
    );
    if (result === "downloaded") toast.success("Файл с копией сохранён");
  };

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const n = await importBackup(file);
      reload();
      toast.success(n ? `Восстановлено партий: ${n}` : "Все партии из копии уже есть");
    } catch {
      toast.error("Это не файл копии из Нотной тетради");
    }
  };

  return (
    <div className="min-h-full pb-safe">
      <NavBar
        hairline={scrolled}
        title={scrolled ? "Партии" : undefined}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ещё">
                  <Ellipsis className="size-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={backup}>
                  <Download /> Сохранить копию всех партий
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                  <Upload /> Восстановить из копии
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setAboutOpen(true)}>О приложении</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" aria-label="Новая партия" onClick={() => navigate(paths.newScore())}>
              <Plus className="size-7" strokeWidth={2} />
            </Button>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          restore(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <LargeTitle>Партии</LargeTitle>
      {failed && (
        <div className="mx-4 mt-2 rounded-lg bg-surface p-4">
          <p className="text-body font-semibold">Не удалось открыть партии</p>
          <p className="mt-1 text-subhead text-muted-foreground">Хранилище браузера недоступно. Попробуйте ещё раз.</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              setFailed(false);
              reload();
            }}
          >
            Повторить
          </Button>
        </div>
      )}
      {!failed && scores === null && (
        <div className="space-y-3 px-4 pt-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-[148px] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      )}
      {scores?.length === 0 && (
        <div className="mx-4 mt-6 flex flex-col items-center rounded-xl bg-surface px-6 py-10 text-center">
          <FileText className="size-10 text-faint" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-title3 font-semibold">Пока нет ни одной партии</p>
          <p className="mt-1 max-w-[30ch] text-subhead text-muted-foreground">
            Создайте первую: выберите тональность и размер, и откроется пустой нотный стан.
          </p>
          <Button className="mt-5" onClick={() => navigate(paths.newScore())}>
            <Plus /> Новая партия
          </Button>
        </div>
      )}
      {scores && scores.length > 0 && (
        <ul className="space-y-3 px-4 pt-1 pb-8">
          {scores.map((s) => (
            <li key={s.id}>
              <ScoreCard
                score={s}
                onOpen={() => navigate(paths.editor(s.id))}
                onDuplicate={() => duplicate(s)}
                onPdf={() => setPdfScore(s)}
                onDelete={() => setToDelete(s)}
              />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={`Удалить «${toDelete?.title ?? ""}»?`}
        description="Партия исчезнет с этого телефона. Сразу после удаления её можно вернуть."
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && remove(toDelete)}
      />
      <PdfSheet score={pdfScore} onClose={() => setPdfScore(null)} />
      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <span className="sr-only" aria-live="polite">
        {scores ? `Партий: ${scores.length}` : ""}
      </span>
    </div>
  );
}

interface ScoreCardProps {
  score: Score;
  onOpen: () => void;
  onDuplicate: () => void;
  onPdf: () => void;
  onDelete: () => void;
}

function ScoreCard({ score, onOpen, onDuplicate, onPdf, onDelete }: ScoreCardProps) {
  const [previewRef, previewWidth] = useWidth();
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left outline-none active:bg-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="px-3 pt-3">
          <div ref={previewRef} className="h-[78px] overflow-hidden rounded-md bg-paper px-2">
            {previewWidth > 0 && <ScorePreview score={score} width={previewWidth - 16} />}
          </div>
        </div>
        <div className="px-4 pt-2.5 pb-3 pr-14">
          <p className="truncate text-body font-semibold">{score.title}</p>
          <p className="mt-0.5 truncate text-footnote text-muted-foreground">
            {scoreSummary(score)} · {formatDate(score.updatedAt)}
          </p>
        </div>
      </button>
      <div className="absolute right-1.5 bottom-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Действия с партией «${score.title}»`}>
              <Ellipsis className="size-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onPdf}>
              <FileText /> PDF для печати
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Дублировать
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

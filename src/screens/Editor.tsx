import { Ellipsis, FileText, ListMusic, Play, Redo2, Settings2, Square, Trash, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NavBar } from "@/components/layout";
import { PdfSheet } from "@/components/PdfSheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Staff } from "@/editor/Staff";
import { Toolbar, type ToolTab } from "@/editor/Toolbar";
import { useEditor } from "@/editor/useEditor";
import { play, schedule, unlockAudio } from "@/lib/audio";
import { navigate, paths } from "@/lib/router";
import { deleteScore, getScore, prefs } from "@/lib/storage";
import type { Cursor, Score } from "@/lib/types";

const TAB_KEY = "nt.tab";

export function EditorScreen({ id, params }: { id: string; params: URLSearchParams }) {
  const [score, setScore] = useState<Score | null | undefined>(undefined);
  useEffect(() => {
    getScore(id).then((s) => setScore(s ?? null));
  }, [id]);

  if (score === undefined) return <div className="h-full bg-background" aria-busy />;
  if (score === null)
    return (
      <div className="flex h-full flex-col">
        <NavBar back={{ label: "Партии", onClick: () => navigate(paths.library()) }} />
        <div className="px-8 pt-16 text-center">
          <p className="text-title3 font-semibold">Партия не найдена</p>
          <p className="mt-1 text-subhead text-muted-foreground">Возможно, её удалили на этом телефоне.</p>
          <Button className="mt-5" variant="secondary" onClick={() => navigate(paths.library())}>
            К списку партий
          </Button>
        </div>
      </div>
    );
  return <Editor key={`${score.id}:${params.toString()}`} initial={score} params={params} />;
}

/** `?sel=3.2` selects the 2nd event of measure 3. */
function parseSelection(sel: string | null): Cursor | undefined {
  if (!sel) return;
  const [m, e] = sel.split(".").map(Number);
  return Number.isFinite(m) ? { m: Math.max(0, m - 1), e: Math.max(0, (e || 1) - 1) } : undefined;
}

function Editor({ initial, params }: { initial: Score; params: URLSearchParams }) {
  const editor = useEditor(initial, parseSelection(params.get("sel")));
  const { score, cursor, actions } = editor;
  const [tab, setTabState] = useState<ToolTab>(() => (params.get("tab") || prefs.get(TAB_KEY) || "keys") as ToolTab);
  const setTab = (t: ToolTab) => {
    setTabState(t);
    prefs.set(TAB_KEY, t);
  };
  const [playhead, setPlayhead] = useState<Cursor | null>(null);
  const [playing, setPlaying] = useState(false);
  const player = useRef<{ stop: () => void } | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleVisible, setTitleVisible] = useState(true);

  // Show the title in the navigation bar once the sheet title scrolls away.
  useEffect(() => {
    if (!titleRef.current || !scroller.current) return;
    const io = new IntersectionObserver(([entry]) => setTitleVisible(entry.isIntersecting), {
      root: scroller.current,
      threshold: 0,
    });
    io.observe(titleRef.current);
    return () => io.disconnect();
  }, []);

  const stop = () => {
    player.current?.stop();
    player.current = null;
  };
  useEffect(() => stop, []);

  const togglePlay = async (from?: Cursor) => {
    if (playing) return stop();
    unlockAudio();
    setPlaying(true);
    player.current = await play(schedule(score, from), setPlayhead, () => {
      setPlaying(false);
      setPlayhead(null);
      player.current = null;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (e.key === "ArrowRight") actions.move(1);
      else if (e.key === "ArrowLeft") actions.move(-1);
      else if (e.key === "ArrowUp") actions.stepPitch(1);
      else if (e.key === "ArrowDown") actions.stepPitch(-1);
      else if (e.key === "Backspace" || e.key === "Delete") actions.remove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <NavBar
        back={{
          label: titleVisible ? "Партии" : "",
          a11yLabel: "Партии",
          onClick: () => {
            stop();
            navigate(paths.library());
          },
        }}
        title={titleVisible ? undefined : score.title}
        titleInset={[52, 184]}
        hairline={!titleVisible}
        actions={
          <>
            <Button variant="ghost" size="icon" aria-label="Отменить" disabled={!editor.canUndo} onClick={actions.undo}>
              <Undo2 className="size-[22px]" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Повторить" disabled={!editor.canRedo} onClick={actions.redo}>
              <Redo2 className="size-[22px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={playing ? "Остановить" : "Слушать партию"}
              aria-pressed={playing}
              onClick={() => togglePlay()}
            >
              {playing ? <Square className="size-5 fill-current" /> : <Play className="size-6 fill-current" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ещё">
                  <Ellipsis className="size-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => togglePlay({ m: cursor.m, e: 0 })}>
                  <ListMusic /> Слушать с такта {cursor.m + 1}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPdfOpen(true)}>
                  <FileText /> PDF для печати
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    stop();
                    navigate(paths.settings(score.id));
                  }}
                >
                  <Settings2 /> Параметры партии
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash /> Удалить партию
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pt-3 pb-6">
        <article className="rounded-lg bg-paper px-2.5 pt-5 pb-3 text-ink shadow-paper">
          <header className="px-2 pb-1 text-center">
            <h1 ref={titleRef} className="font-sheet text-title2 font-bold leading-tight">
              {score.title}
            </h1>
            {(score.composer || score.arranger) && (
              <p className="mt-1 font-sheet text-footnote opacity-70">
                {[score.composer && `Музыка: ${score.composer}`, score.arranger && `Партия: ${score.arranger}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </header>
          <Staff
            score={score}
            cursor={cursor}
            playing={playhead}
            flash={editor.flash}
            notice={editor.notice}
            onSelect={actions.select}
            onPlace={(at, pitch) => actions.enterNote(pitch, at)}
            onRepitch={actions.setPitch}
            onError={actions.error}
          />
        </article>
      </main>
      <Toolbar editor={editor} tab={tab} onTab={setTab} onUndo={actions.undo} />
      <PdfSheet score={pdfOpen ? score : null} onClose={() => setPdfOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        title={`Удалить «${score.title}»?`}
        description="Партия исчезнет с этого телефона без возможности вернуть."
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          stop();
          await deleteScore(score.id);
          navigate(paths.library(), { replace: true });
        }}
      />
    </div>
  );
}

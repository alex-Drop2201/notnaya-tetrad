import { useEffect, useState } from "react";
import { FormScreen } from "@/components/FormScreen";
import { ScoreForm, type ScoreFormValue } from "@/components/ScoreForm";
import { Button } from "@/components/ui/button";
import { navigate, paths } from "@/lib/router";
import { changeKey, changeTime } from "@/lib/score";
import { getScore, prefs, saveScore } from "@/lib/storage";
import type { Score } from "@/lib/types";
import { ARRANGER_KEY } from "./NewScore";

export function ScoreSettings({ id }: { id: string }) {
  const [score, setScore] = useState<Score | null | undefined>(undefined);
  const [value, setValue] = useState<ScoreFormValue | null>(null);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    getScore(id).then((s) => {
      setScore(s ?? null);
      if (s)
        setValue({
          title: s.title,
          composer: s.composer,
          arranger: s.arranger,
          keyFifths: s.keyFifths,
          time: s.time,
          tempo: s.tempo,
          measures: s.measures.length,
          partName: s.second ? s.partName : undefined,
          secondName: s.second?.name,
        });
    });
  }, [id]);

  const back = () => navigate(paths.editor(id), { replace: true });

  if (score === null)
    return (
      <FormScreen title="Параметры" back={{ label: "Партии", onClick: () => navigate(paths.library()) }}>
        <p className="px-8 pt-10 text-center text-subhead text-muted-foreground">Такой партии нет на этом телефоне.</p>
      </FormScreen>
    );
  if (!score || !value) return null;

  const timeChanged = value.time.beats !== score.time.beats || value.time.beatType !== score.time.beatType;
  const dirty =
    value.title !== score.title ||
    value.composer !== score.composer ||
    value.arranger !== score.arranger ||
    value.keyFifths !== score.keyFifths ||
    value.tempo !== score.tempo ||
    (!!score.second && (value.partName !== score.partName || value.secondName !== score.second.name)) ||
    timeChanged ||
    (value.time.symbol ?? "") !== (score.time.symbol ?? "");

  const save = async () => {
    if (!value.title.trim()) {
      setTitleError(true);
      return;
    }
    let next: Score = {
      ...score,
      title: value.title.trim(),
      composer: value.composer.trim(),
      arranger: value.arranger.trim(),
      tempo: value.tempo,
    };
    if (score.second) {
      next.partName = value.partName?.trim() || score.partName;
      next.second = { ...score.second, name: value.secondName?.trim() || score.second.name };
    }
    if (value.keyFifths !== score.keyFifths) next = changeKey(next, value.keyFifths);
    next = timeChanged ? changeTime(next, value.time) : { ...next, time: value.time };
    next.updatedAt = new Date().toISOString();
    await saveScore(next);
    prefs.set(ARRANGER_KEY, next.arranger);
    back();
  };

  return (
    <FormScreen
      title="Параметры партии"
      back={{ label: "Назад", onClick: back }}
      footer={
        <Button size="lg" onClick={save} disabled={!dirty}>
          Сохранить
        </Button>
      }
    >
      <ScoreForm mode="edit" value={value} onChange={setValue} titleError={titleError} timeChanged={timeChanged} />
    </FormScreen>
  );
}

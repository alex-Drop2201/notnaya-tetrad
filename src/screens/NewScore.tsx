import { useState } from "react";
import { FormScreen } from "@/components/FormScreen";
import { ScoreForm, type ScoreFormValue } from "@/components/ScoreForm";
import { Button } from "@/components/ui/button";
import { navigate, paths } from "@/lib/router";
import { createScore } from "@/lib/score";
import { prefs, saveScore } from "@/lib/storage";

/** Remembered so the next new part is signed the same way. */
export const ARRANGER_KEY = "nt.arranger";

export function NewScore() {
  const [value, setValue] = useState<ScoreFormValue>(() => ({
    title: "",
    composer: "",
    arranger: prefs.get(ARRANGER_KEY) ?? "",
    keyFifths: 0,
    time: { beats: 4, beatType: 4 },
    tempo: 80,
    measures: 8,
  }));
  const [titleError, setTitleError] = useState(false);

  const create = async () => {
    if (!value.title.trim()) {
      setTitleError(true);
      document.querySelector<HTMLInputElement>("input[aria-invalid]")?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const score = createScore(value);
    await saveScore(score);
    prefs.set(ARRANGER_KEY, value.arranger.trim());
    navigate(paths.editor(score.id), { replace: true });
  };

  return (
    <FormScreen
      title="Новая партия"
      back={{ label: "Партии", onClick: () => navigate(paths.library()) }}
      footer={
        <Button size="lg" onClick={create}>
          Создать партию
        </Button>
      }
    >
      <ScoreForm
        mode="create"
        value={value}
        titleError={titleError}
        onChange={(v) => {
          setValue(v);
          if (titleError && v.title.trim()) setTitleError(false);
        }}
      />
    </FormScreen>
  );
}

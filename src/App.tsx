import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useRoute } from "@/lib/router";
import { requestPersistence, seedOnce } from "@/lib/storage";
import { EditorScreen } from "@/screens/Editor";
import { Library } from "@/screens/Library";
import { NewScore } from "@/screens/NewScore";
import { ScoreSettings } from "@/screens/ScoreSettings";

export function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    requestPersistence();
    seedOnce().finally(() => setReady(true));
  }, []);
  // Radix can leave pointer-events: none on body if a menu was open while the route changed.
  useEffect(() => {
    document.body.style.pointerEvents = "";
  }, [route]);
  if (!ready) return null;
  return (
    <>
      {route.name === "library" && <Library />}
      {route.name === "new" && <NewScore />}
      {route.name === "editor" && <EditorScreen id={route.id} params={route.params} />}
      {route.name === "settings" && <ScoreSettings id={route.id} />}
      <Toaster />
    </>
  );
}

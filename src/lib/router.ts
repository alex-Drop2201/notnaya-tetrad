import { useEffect, useState } from "react";

// Hash routing, so the app works from any folder on GitHub Pages and offline.

export type Route =
  | { name: "library" }
  | { name: "new" }
  | { name: "editor"; id: string; params: URLSearchParams }
  | { name: "settings"; id: string };

function parse(hash: string): Route {
  const [path, query = ""] = (hash.replace(/^#/, "") || "/").split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return { name: "new" };
  if (parts[0] === "score" && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    return parts[2] === "settings" ? { name: "settings", id } : { name: "editor", id, params: new URLSearchParams(query) };
  }
  return { name: "library" };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const hash = `#${path}`;
  if (options.replace) window.location.replace(hash);
  else window.location.hash = path;
}

export const paths = {
  library: () => "/",
  newScore: () => "/new",
  editor: (id: string) => `/score/${encodeURIComponent(id)}`,
  settings: (id: string) => `/score/${encodeURIComponent(id)}/settings`,
};

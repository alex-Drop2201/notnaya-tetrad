import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Writes precache-manifest.json next to the build. The service worker (public/sw.js)
// reads it on install and caches every listed file, so the installed app works offline.
// A new version number on each build makes the worker replace the old cache.
function precacheManifest(): Plugin {
  return {
    name: "precache-manifest",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith("assets/") && !f.endsWith(".map"))
        .sort((a, b) => order(a) - order(b) || a.localeCompare(b));
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: JSON.stringify({ version: Date.now(), files }),
      });
    },
  };
}

function order(file: string) {
  if (file.endsWith(".js")) return file.includes("/index-") ? 0 : 1;
  if (file.endsWith(".ttf")) return 2;
  return 3;
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), precacheManifest()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});

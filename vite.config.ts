import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Writes the service worker (src/sw.js) into the build with this build's version and the
// list of built files. The worker caches them on install, so the installed app works
// offline; the new version makes the browser install the new worker on the next visit.
function serviceWorker(): Plugin {
  return {
    name: "service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith("assets/") && !f.endsWith(".map"))
        .sort((a, b) => order(a) - order(b) || a.localeCompare(b));
      const template = readFileSync(fileURLToPath(new URL("./src/sw.js", import.meta.url)), "utf8");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template.replace("__VERSION__", String(Date.now())).replace("__FILES__", JSON.stringify(files)),
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
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});

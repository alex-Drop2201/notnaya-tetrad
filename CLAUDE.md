# Нотная тетрадь

PWA for writing violin parts (mostly second parts) on iPhone. The owner builds it for their wife, who uses it from the home screen. UI language is Russian.

## Where things are

- Source code: branch **`source`** (this one). Built site: branch **`main`** (GitHub Pages). See README for the layout of `src/`.
- Standing instruction from the owner: keep **all** app code in GitHub. Commit and push to `source` as you work; publish with `npm run deploy`, which builds and pushes the site to `main`. Never hand-edit `main`, never leave work only in a local folder.
- If a session started on `main` or on a `claude/...` branch made from it: `git fetch origin source && git checkout source` (or branch from `origin/source`), and push the result to `source`.

## Checks before pushing

```sh
npm run build      # tsc -b + vite build; must pass with no errors
```

Then open the app (`npm run preview`) and try what you changed in a phone-sized window (390×844, touch). Playwright with Chromium is available in cloud sessions: `executablePath: '/opt/pw-browsers/chromium'`.

## Design work

The **Impeccable** skill is installed in `.claude/skills/impeccable` (with its agents in `.claude/agents` and detector hooks in `.claude/settings.json`); use `/impeccable` for design reviews and fixes. The last full audit and what was fixed: `docs/AUDIT.md`. The detector: `.claude/skills/impeccable/scripts/impeccable detect src/` (for live screens see the end of `docs/AUDIT.md`).

## Rules of the code

- `src/lib/score.ts` holds every edit as a pure function `(score, cursor, …) → EditResult`; the editor hook only applies results. Put new editing behaviour there.
- Stored data: `Score` in `src/lib/types.ts`, `schemaVersion: 1`, IndexedDB `notnaya-tetrad`/`scores`, localStorage keys `nt.*`. Parts already saved on the phone must keep opening: only add optional fields, never rename or remove.
- Styling: Tailwind 4 with the tokens in `src/index.css` (light and dark). Custom text sizes (`text-footnote`, `text-subhead`, …) are registered with tailwind-merge in `src/lib/utils.ts`; register any new one there too.
- iPhone first: touch targets at least 44 px, no hover-only UI, safe-area padding (`pt-safe`, `pb-safe`).
- Service worker (`public/sw.js`) precaches the files listed in the generated `precache-manifest.json`; a new build gets a new cache automatically.

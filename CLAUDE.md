# Нотная тетрадь — read this first

This `main` branch is **only the built site** that GitHub Pages serves. Don't edit files here.

The source code lives in the **`source`** branch of this same repository. Before doing anything:

```sh
git fetch origin source
git checkout source        # or: git checkout -b <your-branch> origin/source
npm ci
```

Then follow `CLAUDE.md` in the `source` branch: it explains the project, the checks to run and how to publish (`npm run deploy` builds and pushes the new site to `main`).

Standing instruction from the owner: changes to the app are committed and pushed to `source`, and published to `main` with `npm run deploy`. Never commit hand-edited build files to `main`.

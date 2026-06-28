# AGENTS.md — docker-react

Project-specific conventions for this repo. Process rules that span all projects live in
the operator's global `AGENTS.md`; this file holds only what's true *here*. Current-branch
work is described in `PLAN.md` (design) and `TASKS.md` (status) — read those when picking
up active work.

## What this project is

A CLI **and** an nginx base Docker image for deploying React apps with **runtime**
environment-variable injection. The app is built once; env is injected at container start
rather than baked in at build time. The CLI (`docker-react`) validates `process.env`
against a consumer-supplied Zod schema and emits `window.env.js`; the app reads
`window.env.*` instead of `import.meta.env`. See `README.md` for the consumer-facing flow.

## Build & verify

- Canonical check: **`npm run build`** (`tsc`, compiles `cli/` → `dist/`) **+ `npm test`**.
  Both must pass on every commit; CI runs them in sequence. Type errors are still the primary
  safety net.
- **`npm test`** is the fast logic tier: `node --test` (via `tsx`) over `test/**/*.test.ts`.
  No docker — it exercises each `Step`'s `check()`/`apply()` against throwaway temp-dir
  fixtures (`test/helpers/project.ts`: `makeTempProject` + `buildCtx`). Add new step tests as
  `test/steps/<key>.test.ts`. `npm run test:watch` for watch mode; `npm run test:types`
  type-checks the tests (`tsconfig.test.json`; the build's `tsconfig.json` excludes `test/`).
- **`npm run test:e2e`** runs the end-to-end test (`e2e/run.mjs`): scaffold a fresh Vite app
  → local `init` → docker build/run → headless Playwright assert that `window.env`
  injection reached the browser. It needs **docker** (the dev container provides it via the
  `docker-in-docker` feature) and a one-time `npx playwright install --with-deps chromium`.
  It is the **PR gate** (a dedicated CI job on pull requests). Prefer running it to verify
  changes — it automates (and supersedes) the by-hand recipe in PLAN.md, with less room for
  mistakes.
- CI (`.github/workflows/ci.yml`) runs `npm ci` → `npm run build` → `npm t` on every PR,
  plus the `e2e` gate job on pull requests. Publishing to npm + Docker Hub is tag-triggered
  (`v*`).

## Code conventions

- **ESM throughout.** `package.json` is `type: module`; `tsconfig` is `NodeNext`. In TS
  source, relative imports use the **`.js`** extension (e.g. `import { cli } from
  './index.js'`) even though the file is `.ts` — required by NodeNext resolution.
- **Commander CLI.** Each command is registered by an `addXCommand(program: Command)`
  function (see `cli/prep.ts`), composed in `cli/index.ts`. `bin/docker-react.js` is a thin
  shim that imports `dist/index.js` and calls `cli(process.argv)`.
- **Zod v4** (pinned exact, and a `peerDependency`). Use current v4 syntax — e.g.
  `z.url()`, **not** `z.string().uri()` (deprecated) and **not** `.required()` (not a
  method). Consumer schemas are loaded via dynamic `import()` and read from `.default`, so
  any scaffolded schema must `export default`.
- **Prettier** via `@danielemeryau/prettier-config` (`prettier.config.cjs`).
- Match the existing terse style: small modules, `console.log` progress lines, throw on
  error.

## Version coupling (important)

The published npm package version, the Docker image tag (`demery/docker-react:vX.Y.Z`),
and the `docker-react` the image installs globally are **the same version** by design. Any
code that generates a consumer `Dockerfile` must derive the `FROM` tag from this CLI's own
`package.json` version — never hard-code or flag it — or the consumer's image and CLI drift
apart.

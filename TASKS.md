# TASKS — Automate consumer bootstrap (`init` + `check`)

Branch: `automate-bootstrap`

> **Picking up a slice?** Read `PLAN.md` first (design, `Step` contract, module layout,
> landmines, verify recipe), then `AGENTS.md` (repo conventions). This file is the
> decision record + slice checklist + status.

## Goal

Extend the `docker-react` CLI so a consuming project can:

- **`docker-react init`** — perform the project setup steps (write/modify files), idempotently.
- **`docker-react check`** — validate that each setup step has been performed (read-only, CI-friendly).

This delivers the unchecked **Application initialization** feature in the README
(index.html modification, Dockerfile generation) plus validation tooling around the
full 7-step setup flow documented in README "Implementation Instructions".

## Decisions (locked this session)

| Topic | Decision |
|-------|----------|
| Command surface | `init` (perform) + `check` (validate), siblings of existing `prep` |
| Perform scope | Perform steps 2–6; steps 1 (deps) & 7 (env-ref rewrite) are **advise-only** — never auto-run npm, never rewrite source |
| Architecture | One `Step` object per setup step exposing both `check()` and `apply()` — single source of truth shared by both commands |
| Re-run safety | Idempotent. Skip already-satisfied steps. On a divergent existing file: **report + skip** (never clobber). `--force` opts into overwrite. `check` is always read-only |
| Interaction | Flag-driven, **non-interactive** (CI-safe). No prompt library / new deps. Conflicts are reported, not prompted |
| Dockerfile `FROM` version | Derived from the CLI's **own** installed `package.json` version, so image tag always matches the npm package |
| Build output dir | Auto-detect from `vite.config.{ts,js}` `build.outDir`; fall back to `dist`; `--build-dir` override always wins |
| npm scripts (step 6) | Always add `init-local` (npx variant; `--env-file` flag selects the `node --env-file` variant). Prepend to `dev` only if `dev` exists and isn't already wired; else advise. Never clobber a customized `dev` |
| `check` severity | Missing files (2–6) = **FAIL** (exit 1). Dep missing/mismatch (1) = **FAIL**. Leftover env refs (7) = **WARN** (exit 0) |
| `check` output | Per-step pass/fail table + summary; non-zero exit on any hard failure |
| Tooling | **Vite-only** for now; `init`/`check` error clearly if Vite isn't detected |
| `env.schema.js` scaffold | ESM `export default z.object({...})` with **valid Zod v4** syntax (e.g. `z.url()`), matching `prep`'s dynamic-import loader |
| Step selection | `init` always runs all steps (idempotency makes this safe); `--only`/`--skip` deferred |
| Types generation | **Out of scope** — captured as follow-up |
| Repo self-fixes | Fix the repo's own buggy samples/docs in this branch, as **separate commits** |

## Testing strategy — stacked e2e branch (PR gate)

`npm test` stays a stub (`exit 0`) **on this branch**. Real coverage lands on a
**branch stacked on top of `automate-bootstrap`** that adds a true e2e test. Per-slice
manual verification (against a throwaway Vite fixture) covers the gap while developing.

**Gate:** the bootstrap PR is **not raised until the stacked e2e branch is green.**

The e2e test:

- **Fixture:** scaffolds a fresh Vite app on the fly (`npm create vite@latest` non-interactive,
  e.g. `-- --template react-ts`) in a temp dir — closest to a real consumer.
- **Flow:** `init` the scaffolded app → `docker build` → `docker run` with an env var set →
  drive the running container with **Playwright** (headless).
- **Assertion:** the env var reaches the browser via `window.env` (e.g.
  `window.env.VITE_API_URL === 'https://x.test'`) **and** the app renders — proving the
  full runtime-injection path the tool exists for, not just "page loads".
- **Where:** a new **CI job in this repo** (`ci.yml`): docker build + headless Playwright.
  This job's green status is the PR gate.

**⚠️ Key challenge — test the LOCAL code, not the published package.** The generated
Dockerfile does `FROM demery/docker-react:vX.Y.Z` and the image `npm install -g
docker-react@<version>` — both resolve to the *published* release. The e2e must instead
build the base image from the local working tree and install the CLI from a local
`npm pack`/link, so it exercises the unreleased bootstrap changes. The stacked branch
must solve this (e.g. local image tag + overridable `FROM` / packed tarball install).

## Implementation — vertical slices

Each slice cuts top-to-bottom (Step definition → wired into both `init` and `check` →
exercised end-to-end against a fixture) so it's independently reviewable. Build the
framework together with its first caller (Slice 1), not ahead of it.

- [x] **Slice 1 — Step framework + command skeleton + first step (`.dockerignore`)**
  - Define `Step` interface (`key`, `label`, `severity`, `check()`, `apply()`) in `cli/steps/`.
  - Add `addInitCommand` / `addCheckCommand` (commander), registered in `cli/index.ts`.
  - `check`: run every step's `check()`, print per-step status + summary, exit code per severity.
  - `init`: run every step's `apply()` (skip if `check()` already satisfied; `--force` overrides).
  - Implement `.dockerignore` step (check: exists & contains `node_modules`; apply: write template).
  - Project context helper (`cli/project.ts`): locate consumer root + read its `package.json`.
  - **Verify (manual):** scaffold a bare Vite app fixture; `check` fails → `init` → `check` passes; re-run `init` is a no-op.

- [x] **Slice 2 — Dockerfile step**
  - Resolve own version from the CLI's installed `package.json`.
  - Resolve build dir: regex `vite.config.{ts,js}` for `build.outDir` → fallback `dist`; `--build-dir` wins.
  - apply: write `Dockerfile` (`FROM demery/docker-react:vX.Y.Z`, `COPY env.schema.js`, `COPY <buildDir> /usr/share/nginx/html`).
  - check: file exists AND `FROM` tag matches own version.
  - **Risk:** TS vite config can't be `import()`ed — regex extraction only; log when falling back.

- [x] **Slice 3 — `env.schema.js` step**
  - Refactor `prep.ts`'s schema-load logic into a shared `cli/schema-loader.ts`.
  - apply: scaffold ESM + valid Zod v4 `export default` schema (skip if file present).
  - check: file exists, importable, resolves to a Zod schema.

- [x] **Slice 4 — `index.html` step**
  - apply: inject `<script src="/window.env.js"></script>` before `</head>` (idempotent — detect existing tag); `--html` override; error clearly if no `<head>`.
  - check: tag present in resolved html file.

- [x] **Slice 5 — `package.json` scripts step**
  - apply: add `init-local` (npx variant; `--env-file` selects node variant); safe-wire `dev`.
  - check: `init-local` present (and `dev` wired or advised).

- [x] **Slice 6 — Dependency advisory (step 1)**
  - check: read consumer `package.json`; verify `docker-react` present and `zod` matches our exact `peerDependencies` version. Hard-fail on mismatch.
  - `init`: advise only — print the `npm i -S ...` command; never run npm.

- [x] **Slice 7 — Env-ref advisory (step 7)**
  - check: grep source for `import.meta.env` / `process.env`; **warn** (soft, exit 0); list locations.
  - `init`: advise only — never rewrite source.

## Repo self-consistency (separate commits)

Pre-existing doc/sample bugs — landed in `main` via PR #68 (separate patch branch):

- [x] Fix `sample.zod.schema.js` → ESM + valid Zod v4. *(PR #68)*
- [x] Fix README schema examples (invalid `.uri().required()` → valid Zod v4). *(PR #68)*
- [x] Correct README `COPY build` → `dist`. *(PR #68)*

Feature-coupled doc updates (this branch):

- [x] Update README "Implementation Instructions" to reference `init` / `check` (incl. auto-detect note for the build dir).
- [x] Tick the Features checkboxes that `init`/`check` now satisfy.

## Follow-ups (out of scope this branch)

- e2e test on the **stacked branch** (see Testing strategy) — gates this PR.
- TypeScript types generation (`window.env.d.ts`) from the Zod schema.
- `init --only` / `--skip` step selection.
- Full (non-regex) vite config resolution.
- Non-Vite tooling support.

## Verification

On this branch: `npm run build` (tsc) must succeed for every commit, plus the per-slice
manual verification against a throwaway Vite fixture. The automated e2e gate lives on the
stacked branch (see Testing strategy) and must be green before the bootstrap PR is raised.

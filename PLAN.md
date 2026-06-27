# PLAN — `init` + `check` design

Durable design for the consumer-bootstrap feature (`docker-react init` / `check`). This is
the *how* and *why* of the design; it stands on its own. Repo-wide conventions live in
**AGENTS.md**.

## Domain primer (why this exists)

`docker-react` lets a React app be **built once** and have its environment injected **at
container start**, instead of baked in at build time. Mechanism: an nginx base image
serves the static bundle; on startup the entrypoint runs `docker-react prep`, which
validates `process.env` against a consumer-supplied Zod schema and writes
`window.env = {...}` to `window.env.js`. The app reads `window.env.*` (not
`import.meta.env`). `window.env.js` is served uncached so the same image works in any
environment.

`prep` already exists. This feature adds the **setup** around it, automating the manual
consumer onboarding documented in README "Implementation Instructions":

- **`init`** — performs the one-time consumer setup: scaffold the schema, inject the html
  tag, generate Dockerfile + .dockerignore, wire npm scripts. Two steps are advisory
  (reported, never mutated): dependency install, and rewriting `import.meta.env` →
  `window.env` in source.
- **`check`** — validates each step is done; CI-friendly exit codes.

`init` and `check` are two views over **one ordered list of `Step`s** — same definitions,
so "what we validate" can't drift from "what we do".

## Setup steps

The onboarding flow is seven steps; the tool's relationship to each:

| # | Step | `init` | `check` |
|---|------|--------|---------|
| 1 | Install `docker-react` + `zod@<exact>` | advise only (never runs npm) | hard-fail if missing/mismatched |
| 2 | Create `env.schema.js` | scaffold (ESM, valid Zod v4) | exists + importable + is a Zod schema |
| 3 | Inject `<script src="/window.env.js">` into `index.html` | inject before `</head>` | tag present |
| 4 | Generate version-pinned `Dockerfile` | template | exists + `FROM` tag matches CLI version |
| 5 | Generate `.dockerignore` | template | exists + contains `node_modules` |
| 6 | Add `init-local` script + wire `dev` | add + safe-wire | scripts present |
| 7 | Replace `import.meta.env`/`process.env` → `window.env` | advise only (never rewrites source) | grep + warn (soft) |

## Module layout

```
cli/
  index.ts          # registers prep + init + check on the Command
  prep.ts           # existing prep command (refactor schema-load out — see seam below)
  init.ts           # addInitCommand: iterate steps, apply()
  check.ts          # addCheckCommand: iterate steps, check(), exit code
  options.ts        # existing Options + new InitCheckOptions
  file.ts           # existing find/replace helper
  project.ts        # NEW: resolve consumer root, load its package.json, detect Vite, read build.outDir
  schema-loader.ts  # NEW: shared schema load+validate (extracted from prep)
  report.ts         # NEW: render per-step status table + summary, compute exit code
  steps/
    types.ts        # Step + StepContext + result types
    index.ts        # the ordered Step[] (the single source of truth)
    dependencies.ts # step 1 (advisory): zod/docker-react present + zod version exact
    schema.ts       # step 2: env.schema.js scaffold + loadability
    index-html.ts   # step 3: <script src="/window.env.js"> injection
    dockerfile.ts   # step 4: version-pinned FROM + COPY <buildDir>
    dockerignore.ts # step 5: node_modules
    scripts.ts      # step 6: init-local + safe-wire dev
    env-refs.ts     # step 7 (advisory): grep for import.meta.env / process.env
```

Build is `tsc` (`cli/` → `dist/`); the `bin/docker-react.js` shim imports `dist/index.js`.

## The shared contract — `Step`

This is the keystone of the design. Each setup step is one `Step`; every step depends on
this interface, so it must be settled before the individual steps are implemented — a later
change to it churns all of them.

```ts
// cli/steps/types.ts
export type Severity = 'error' | 'warn';

export interface StepContext {
  root: string;                 // absolute consumer project root (cwd)
  pkg: PackageJson;             // parsed consumer package.json
  options: InitCheckOptions;    // resolved CLI flags (force, html, buildDir, envFile, ...)
  selfVersion: string;          // this CLI's own version -> Dockerfile FROM tag
  requiredZodVersion: string;   // our peerDependencies.zod (exact) -> dep check
}

export interface CheckResult {
  ok: boolean;
  severity: Severity;           // 'error' = hard fail (exit 1); 'warn' = soft (exit 0)
  message: string;              // one-line status for the report
  detail?: string;              // guidance shown when !ok
}

export interface ApplyResult {
  changed: boolean;             // false = already satisfied / skipped (idempotent no-op)
  message: string;
  conflict?: boolean;           // divergent file left untouched; needs --force
}

export interface Step {
  key: string;                  // stable id, e.g. 'dockerfile' (future --only/--skip)
  label: string;                // short report label
  advisory?: boolean;           // steps 1 & 7: apply() only reports, never mutates
  check(ctx: StepContext): Promise<CheckResult>;
  apply(ctx: StepContext): Promise<ApplyResult>;  // idempotent; honors options.force
}
```

**`check` command:** run every `check()`, render the table, exit `1` if any result is
`!ok && severity === 'error'` (warnings never fail the build).

**`init` command:** for each step, run `check()` first — if `ok`, skip (`already
satisfied`); else `apply()`. Advisory steps print guidance instead of mutating. A
`conflict` (divergent file, no `--force`) is reported and the run ends non-zero so it's
visible, but other steps still run.

## The `prep` refactor seam

`prep.ts` currently inlines schema loading + validation in `generateEnvironmentFile`.
Extract into `cli/schema-loader.ts`:

- `loadSchema(root, schemaPath): Promise<z.ZodType>` — the `path.join(cwd, schemaPath)` +
  `await import()` + `.default` logic.
- `validateEnv(schema, env): unknown` — the existing `safeParse`/throw logic.

`prep` keeps its behaviour (pure refactor); the schema step's `check()` reuses `loadSchema`
to confirm the file resolves to a Zod schema. While in `prep.ts`, fix the malformed option
string `'-d, --destination [string'` (missing `]`).

## Landmines (design constraints — don't rediscover)

- **`vite.config.ts` can't be `import()`ed** at runtime (it's TS). Build-dir detection
  (`dockerfile` step) is **regex** for `build.outDir` over the config text → fallback
  `dist`. `--build-dir` wins. Log when falling back so it's not silent.
- **`build` vs `dist`:** README step 4 says `COPY build` but stock Vite emits `dist`. The
  generated Dockerfile uses the detected/overridden dir.
- **Dockerfile `FROM` version = `selfVersion`.** The image's entrypoint also does
  `npm install -g docker-react@<version>`, so the tag and the package must match — that's
  why the tag is derived from this CLI's own `package.json`, never a flag.
- **Zod v4 syntax:** the scaffolded schema uses `z.url()`, not
  `z.string().uri().required()` (`.uri()` deprecated, `.required()` invalid), with ESM
  `export default`. (See AGENTS.md.)
- **Schema load contract:** consumer schema is loaded via dynamic `import()` + `.default`,
  so the scaffold must `export default`.
- **index.html injection:** inject before `</head>`; idempotent (skip if
  `src="/window.env.js"` already present); error clearly if there's no `<head>`. `--html`
  override.
- **`dev` wiring:** only prepend `init-local` if `dev` exists and isn't already wired;
  never clobber a customized `dev`.
- **Testing the local code, not the published package:** any end-to-end test of `init`
  must build the base image and install the CLI from the local working tree — the generated
  Dockerfile's `FROM demery/docker-react:vX.Y.Z` and the image's global
  `npm install docker-react@<version>` both otherwise resolve to the *published* release,
  not the change under test. This may push the generated `FROM` tag to be overridable.

## Manual verification recipe

No automated test runner exists yet (`npm test` is a stub), so verify changes by hand:

```sh
# 1. Build the CLI from this working tree
npm run build                      # in the docker-react repo root

# 2. Scaffold a throwaway consumer
cd "$(mktemp -d)"
npm create vite@latest app -- --template react-ts
cd app && npm install

# 3. Exercise against the LOCAL build (not an npx-published version)
DR=/workspaces/docker-react/bin/docker-react.js
node "$DR" check     # expect failures before init
node "$DR" init
node "$DR" check     # expect pass after init
node "$DR" init      # expect all-satisfied no-op (idempotency)
```

Confirm each step flips fail→pass after `init`, and that re-running `init` is a no-op.

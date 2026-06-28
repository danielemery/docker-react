import { promises as fs } from 'fs';
import path from 'path';

import type {
  ApplyResult,
  CheckResult,
  PackageJson,
  Step,
  StepContext,
} from './types.js';

const SCRIPT = 'init-local';
const NPX_VARIANT = 'npx docker-react prep -s ./env.schema.js -d public';
const NODE_VARIANT =
  'node --env-file=.env ./node_modules/.bin/docker-react prep -s ./env.schema.js -d public';
const DEV_PREFIX = 'npm run init-local && ';

function initLocalCommand(envFile?: boolean): string {
  return envFile ? NODE_VARIANT : NPX_VARIANT;
}

/** True once `dev` runs init-local before the dev server. */
function devIsWired(dev: string): boolean {
  return dev.includes(SCRIPT);
}

/** Preserve the consumer's existing indentation when rewriting package.json. */
function detectIndent(raw: string): string {
  const match = raw.match(/\n([ \t]+)"/);
  return match ? match[1] : '  ';
}

export const scriptsStep: Step = {
  key: 'scripts',
  label: 'package.json scripts',

  async check(ctx: StepContext): Promise<CheckResult> {
    const scripts = ctx.pkg.scripts ?? {};
    if (!scripts[SCRIPT]) {
      return {
        ok: false,
        severity: 'error',
        message: `\`${SCRIPT}\` script missing`,
        detail: `Run \`docker-react init\` to add the ${SCRIPT} script.`,
      };
    }
    const dev = scripts.dev;
    if (typeof dev === 'string' && !devIsWired(dev)) {
      return {
        ok: false,
        severity: 'warn',
        message: `\`${SCRIPT}\` present but \`dev\` is not wired to it`,
        detail: `Prepend \`${DEV_PREFIX}\` to your \`dev\` script so window.env.js is generated before local dev.`,
      };
    }
    return {
      ok: true,
      severity: 'error',
      message: dev
        ? `\`${SCRIPT}\` present, \`dev\` wired`
        : `\`${SCRIPT}\` present`,
    };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    const pkgPath = path.join(ctx.root, 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as PackageJson;
    const scripts = (pkg.scripts ??= {});

    const changes: string[] = [];

    if (!scripts[SCRIPT]) {
      scripts[SCRIPT] = initLocalCommand(ctx.options.envFile);
      changes.push(`added \`${SCRIPT}\``);
    }

    const dev = scripts.dev;
    if (typeof dev === 'string' && !devIsWired(dev)) {
      scripts.dev = DEV_PREFIX + dev;
      changes.push('wired `dev`');
    }

    if (changes.length === 0) {
      return { changed: false, message: 'already satisfied' };
    }

    const indent = detectIndent(raw);
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, indent) + '\n', 'utf8');

    const message =
      dev === undefined
        ? `${changes.join(', ')} (no \`dev\` script found — add \`${DEV_PREFIX}<your dev command>\` manually)`
        : changes.join(', ');
    return { changed: true, message };
  },
};

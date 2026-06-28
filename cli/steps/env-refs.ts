import { promises as fs } from 'fs';
import path from 'path';

import type { ApplyResult, CheckResult, Step, StepContext } from './types.js';

const SRC_DIR = 'src';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const PATTERNS = ['import.meta.env', 'process.env'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const MAX_LISTED = 20;

interface Hit {
  file: string;
  line: number;
  pattern: string;
}

/** Recursively collect source files referencing the legacy env globals. */
async function scan(dir: string, root: string, hits: Hit[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await scan(full, root, hits);
      }
      continue;
    }
    if (!entry.isFile() || !EXTENSIONS.includes(path.extname(entry.name))) {
      continue;
    }
    const content = await fs.readFile(full, 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
      for (const pattern of PATTERNS) {
        if (line.includes(pattern)) {
          hits.push({ file: path.relative(root, full), line: index + 1, pattern });
        }
      }
    });
  }
}

function formatHits(hits: Hit[]): string {
  const shown = hits
    .slice(0, MAX_LISTED)
    .map((h) => `      - ${h.file}:${h.line} (${h.pattern})`);
  if (hits.length > MAX_LISTED) {
    shown.push(`      …and ${hits.length - MAX_LISTED} more`);
  }
  return `Replace these with window.env (see README step 7):\n${shown.join('\n')}`;
}

export const envRefsStep: Step = {
  key: 'env-refs',
  label: 'env references',
  advisory: true,

  async check(ctx: StepContext): Promise<CheckResult> {
    const hits: Hit[] = [];
    await scan(path.join(ctx.root, SRC_DIR), ctx.root, hits);
    if (hits.length === 0) {
      return {
        ok: true,
        severity: 'warn',
        message: 'no import.meta.env / process.env references found',
      };
    }
    return {
      ok: false,
      severity: 'warn',
      message: `${hits.length} env reference(s) to migrate to window.env`,
      detail: formatHits(hits),
    };
  },

  async apply(): Promise<ApplyResult> {
    // Advisory: never rewrites source. init reports the check() guidance.
    return {
      changed: false,
      message: 'advisory only — migrate env references manually',
    };
  },
};

import { promises as fs } from 'fs';
import path from 'path';

import type { ApplyResult, CheckResult, Step, StepContext } from './types.js';

const DEFAULT_FILE = 'index.html';
const TAG = '<script src="/window.env.js"></script>';
/** Detect an existing window.env.js script tag (either quote style). */
const TAG_RE = /<script[^>]*\bsrc=["']\/window\.env\.js["']/i;
/** The </head> we inject before, capturing its leading indentation. */
const HEAD_CLOSE_RE = /([ \t]*)<\/head>/i;

function relativeHtml(ctx: StepContext): string {
  return ctx.options.html ?? DEFAULT_FILE;
}

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Insert the tag before </head>, or null if there's no </head> to anchor on. */
function inject(content: string): string | null {
  if (!HEAD_CLOSE_RE.test(content)) {
    return null;
  }
  return content.replace(
    HEAD_CLOSE_RE,
    (_match, indent: string) => `${indent}  ${TAG}\n${indent}</head>`,
  );
}

export const indexHtmlStep: Step = {
  key: 'index-html',
  label: 'index.html',

  async check(ctx: StepContext): Promise<CheckResult> {
    const rel = relativeHtml(ctx);
    const content = await readIfPresent(path.join(ctx.root, rel));
    if (content === null) {
      return {
        ok: false,
        severity: 'error',
        message: `missing (${rel})`,
        detail: `Could not find ${rel}. Use --html to point at your HTML entry file.`,
      };
    }
    if (!TAG_RE.test(content)) {
      return {
        ok: false,
        severity: 'error',
        message: 'present but missing window.env.js script tag',
        detail: `Run \`docker-react init\` to inject ${TAG} before </head>.`,
      };
    }
    return { ok: true, severity: 'error', message: 'script tag present' };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    const rel = relativeHtml(ctx);
    const filePath = path.join(ctx.root, rel);
    const content = await readIfPresent(filePath);
    if (content === null) {
      return {
        changed: false,
        conflict: true,
        message: `${rel} not found; left untouched (use --html to point at your HTML entry file)`,
      };
    }
    if (TAG_RE.test(content)) {
      return { changed: false, message: 'already present' };
    }
    const injected = inject(content);
    if (injected === null) {
      return {
        changed: false,
        conflict: true,
        message: `no </head> found in ${rel}; left untouched`,
      };
    }
    await fs.writeFile(filePath, injected, 'utf8');
    return { changed: true, message: 'injected script tag' };
  },
};

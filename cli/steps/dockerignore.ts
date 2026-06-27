import { promises as fs } from 'fs';
import path from 'path';

import type { ApplyResult, CheckResult, Step, StepContext } from './types.js';

const FILE = '.dockerignore';
const REQUIRED_ENTRY = 'node_modules';
const TEMPLATE = `node_modules
npm-debug.log
.git
.gitignore
Dockerfile
.dockerignore
*.local
`;

function hasRequiredEntry(content: string): boolean {
  return content.split(/\r?\n/).some((line) => line.trim() === REQUIRED_ENTRY);
}

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export const dockerignoreStep: Step = {
  key: 'dockerignore',
  label: '.dockerignore',

  async check(ctx: StepContext): Promise<CheckResult> {
    const filePath = path.join(ctx.root, FILE);
    const content = await readIfPresent(filePath);
    if (content === null) {
      return {
        ok: false,
        severity: 'error',
        message: 'missing',
        detail: `Run \`docker-react init\` to create ${FILE}.`,
      };
    }
    if (!hasRequiredEntry(content)) {
      return {
        ok: false,
        severity: 'error',
        message: `present but missing \`${REQUIRED_ENTRY}\``,
        detail: `Add \`${REQUIRED_ENTRY}\` to ${FILE}.`,
      };
    }
    return { ok: true, severity: 'error', message: `present` };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    const filePath = path.join(ctx.root, FILE);
    const existing = await readIfPresent(filePath);

    if (existing !== null) {
      if (hasRequiredEntry(existing)) {
        return { changed: false, message: `already present` };
      }
      if (!ctx.options.force) {
        return {
          changed: false,
          conflict: true,
          message: `exists but is missing \`${REQUIRED_ENTRY}\`; left untouched (use --force to overwrite)`,
        };
      }
    }

    await fs.writeFile(filePath, TEMPLATE, 'utf8');
    return {
      changed: true,
      message: existing === null ? `created` : `overwrote`,
    };
  },
};

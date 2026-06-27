import { promises as fs } from 'fs';
import path from 'path';

import { resolveBuildDir } from '../project.js';
import type { ApplyResult, CheckResult, Step, StepContext } from './types.js';

const FILE = 'Dockerfile';
const IMAGE = 'demery/docker-react';

function expectedFrom(selfVersion: string): string {
  return `${IMAGE}:v${selfVersion}`;
}

function template(selfVersion: string, buildDir: string): string {
  return `FROM ${expectedFrom(selfVersion)}

COPY env.schema.js ./env.schema.js
COPY ${buildDir} /usr/share/nginx/html
`;
}

/** Extract the image reference from the first `FROM` line, if any. */
function parseFrom(content: string): string | null {
  const match = content.match(/^\s*FROM\s+(\S+)/im);
  return match ? match[1] : null;
}

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export const dockerfileStep: Step = {
  key: 'dockerfile',
  label: 'Dockerfile',

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
    const from = parseFrom(content);
    const want = expectedFrom(ctx.selfVersion);
    if (from !== want) {
      return {
        ok: false,
        severity: 'error',
        message: `\`FROM ${from ?? '?'}\` does not match \`${want}\``,
        detail: `Update the FROM line to \`${want}\` (or re-run \`docker-react init --force\`) so the image matches the installed CLI version.`,
      };
    }
    return { ok: true, severity: 'error', message: `present, pinned to v${ctx.selfVersion}` };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    const filePath = path.join(ctx.root, FILE);
    const existing = await readIfPresent(filePath);
    const want = expectedFrom(ctx.selfVersion);

    if (existing !== null) {
      if (parseFrom(existing) === want) {
        return { changed: false, message: `already present` };
      }
      if (!ctx.options.force) {
        return {
          changed: false,
          conflict: true,
          message: `exists with a different FROM; left untouched (use --force to overwrite)`,
        };
      }
    }

    const { dir, source } = await resolveBuildDir(ctx.root, ctx.options.buildDir);
    if (source === 'fallback') {
      console.log(
        `    no build.outDir found in vite config; defaulting to \`${dir}\` (use --build-dir to override)`,
      );
    }

    await fs.writeFile(filePath, template(ctx.selfVersion, dir), 'utf8');
    return {
      changed: true,
      message: `${existing === null ? 'created' : 'overwrote'} (serving \`${dir}\`)`,
    };
  },
};

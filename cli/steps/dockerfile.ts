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

/** True if `from` is our base image (any tag) — the only FROM line we manage. */
function isOurImage(from: string | null): boolean {
  return from !== null && (from === IMAGE || from.startsWith(`${IMAGE}:`));
}

/** Rewrite just the image reference on the first `FROM` line, leaving the rest intact. */
function rewriteFrom(content: string, want: string): string {
  return content.replace(/^(\s*FROM\s+)\S+/im, `$1${want}`);
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
      const detail = isOurImage(from)
        ? `Run \`docker-react init\` to bump the FROM tag to \`${want}\` (the rest of your Dockerfile is preserved) so the image matches the installed CLI version.`
        : `The FROM line does not reference \`${IMAGE}\`. Set it to \`${want}\`, or run \`docker-react init --force\` to regenerate the standard Dockerfile.`;
      return {
        ok: false,
        severity: 'error',
        message: `\`FROM ${from ?? '?'}\` does not match \`${want}\``,
        detail,
      };
    }
    return { ok: true, severity: 'error', message: `present, pinned to v${ctx.selfVersion}` };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    const filePath = path.join(ctx.root, FILE);
    const existing = await readIfPresent(filePath);
    const want = expectedFrom(ctx.selfVersion);
    const from = existing === null ? null : parseFrom(existing);

    // An existing Dockerfile built on our base image is the consumer's to own;
    // the FROM *tag* is the only line we manage. Bump it in place — preserving
    // their ARG/ENV/COPY customizations — rather than clobbering the file. We
    // never full-overwrite such a file, even with --force.
    if (existing !== null && isOurImage(from)) {
      if (from === want) {
        return { changed: false, message: `already present` };
      }
      await fs.writeFile(filePath, rewriteFrom(existing, want), 'utf8');
      return {
        changed: true,
        message: `updated FROM to v${ctx.selfVersion} (kept your Dockerfile)`,
      };
    }

    // A file with a foreign FROM is genuinely divergent: skip unless --force.
    if (existing !== null && !ctx.options.force) {
      return {
        changed: false,
        conflict: true,
        message: `FROM \`${from ?? '?'}\` is not \`${IMAGE}\`; left untouched (use --force to overwrite)`,
      };
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

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { InitCheckOptions } from '../../cli/options.js';
import type { PackageJson, StepContext } from '../../cli/steps/types.js';

export interface TempProject {
  /** Absolute path to the throwaway project root. */
  root: string;
  /** Read a file under the project root (utf8); null if absent. */
  read(rel: string): Promise<string | null>;
  /** Remove the project root. */
  cleanup(): Promise<void>;
}

/**
 * Create a throwaway project directory seeded with `files` (relative path →
 * contents). A minimal `package.json` is written unless one is provided. The
 * caller is responsible for `cleanup()` (use `t.after(...)`).
 */
export async function makeTempProject(
  files: Record<string, string> = {},
): Promise<TempProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-react-test-'));

  if (!('package.json' in files)) {
    files = { 'package.json': JSON.stringify({ name: 'fixture' }), ...files };
  }

  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, 'utf8');
  }

  return {
    root,
    async read(rel) {
      try {
        return await fs.readFile(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/**
 * Build a `StepContext` for `root` with sensible defaults. Override any field
 * (e.g. `options`, `selfVersion`) per test.
 */
export function buildCtx(
  root: string,
  overrides: Partial<StepContext> = {},
): StepContext {
  const pkg: PackageJson = overrides.pkg ?? { name: 'fixture' };
  const options: InitCheckOptions = overrides.options ?? {};
  return {
    root,
    pkg,
    options,
    selfVersion: '1.1.0',
    requiredZodVersion: '4.4.3',
    ...overrides,
  };
}

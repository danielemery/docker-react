import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { InitCheckOptions } from './options.js';
import type { PackageJson, StepContext } from './steps/types.js';

async function readJson(filePath: string): Promise<PackageJson> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as PackageJson;
}

async function readConsumerPackageJson(root: string): Promise<PackageJson> {
  const pkgPath = path.join(root, 'package.json');
  try {
    return await readJson(pkgPath);
  } catch {
    throw new Error(
      `Could not read package.json at ${pkgPath}. Run docker-react from your project root.`,
    );
  }
}

async function readOwnPackageJson(): Promise<PackageJson> {
  // Compiled to dist/project.js, so this CLI's package.json is one level up.
  const ownPath = fileURLToPath(new URL('../package.json', import.meta.url));
  return readJson(ownPath);
}

const VITE_CONFIGS = ['vite.config.ts', 'vite.config.js'];
const OUT_DIR_RE = /outDir\s*:\s*['"]([^'"]+)['"]/;

export type BuildDirSource = 'override' | 'config' | 'fallback';

export interface ResolvedBuildDir {
  dir: string;
  source: BuildDirSource;
}

/**
 * Resolve the build output directory to serve. An explicit override always wins;
 * otherwise regex `build.outDir` out of the Vite config (TS configs can't be
 * `import()`ed, so text extraction is the only option); fall back to `dist`.
 */
export async function resolveBuildDir(
  root: string,
  override?: string,
): Promise<ResolvedBuildDir> {
  if (override) {
    return { dir: override, source: 'override' };
  }
  for (const config of VITE_CONFIGS) {
    const content = await readIfPresent(path.join(root, config));
    if (content === null) {
      continue;
    }
    const match = content.match(OUT_DIR_RE);
    if (match) {
      return { dir: match[1], source: 'config' };
    }
  }
  return { dir: 'dist', source: 'fallback' };
}

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Resolve the consumer project root and assemble the StepContext shared by the
 * init and check commands.
 */
export async function buildContext(
  options: InitCheckOptions,
): Promise<StepContext> {
  const root = process.cwd();
  const pkg = await readConsumerPackageJson(root);
  const own = await readOwnPackageJson();
  const selfVersion = own.version ?? '0.0.0';
  const requiredZodVersion = own.peerDependencies?.zod ?? '';
  return { root, pkg, options, selfVersion, requiredZodVersion };
}

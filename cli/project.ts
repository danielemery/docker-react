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

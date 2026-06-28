import { promises as fs } from 'fs';
import path from 'path';

import { isZodSchema, loadSchema } from '../schema-loader.js';
import type { ApplyResult, CheckResult, Step, StepContext } from './types.js';

const FILE = 'env.schema.js';
const TEMPLATE = `import { z } from 'zod';

// Runtime environment variables, validated against process.env at container
// start and exposed to the app as window.env.<NAME>. Keep the default export.
export default z.object({
  // VITE_API_URL: z.url(),
});
`;

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const schemaStep: Step = {
  key: 'schema',
  label: 'env.schema.js',

  async check(ctx: StepContext): Promise<CheckResult> {
    const filePath = path.join(ctx.root, FILE);
    if (!(await exists(filePath))) {
      return {
        ok: false,
        severity: 'error',
        message: 'missing',
        detail: `Run \`docker-react init\` to scaffold ${FILE}.`,
      };
    }
    let schema: unknown;
    try {
      schema = await loadSchema(ctx.root, FILE);
    } catch (error) {
      return {
        ok: false,
        severity: 'error',
        message: 'present but not importable',
        detail: `Could not load ${FILE}: ${(error as Error).message}`,
      };
    }
    if (!isZodSchema(schema)) {
      return {
        ok: false,
        severity: 'error',
        message: 'default export is not a Zod schema',
        detail: `${FILE} must \`export default\` a Zod schema (e.g. z.object({...})).`,
      };
    }
    return { ok: true, severity: 'error', message: 'present and importable' };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    const filePath = path.join(ctx.root, FILE);
    if (await exists(filePath)) {
      return { changed: false, message: 'already present' };
    }
    await fs.writeFile(filePath, TEMPLATE, 'utf8');
    return { changed: true, message: 'created' };
  },
};

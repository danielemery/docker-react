import path from 'path';

import type z from 'zod';

/**
 * Load a consumer-supplied Zod schema. The schema is loaded via dynamic
 * `import()` and read from its `default` export, so a scaffolded schema must
 * `export default`. Throws if the file can't be imported or has no default.
 */
export async function loadSchema(
  root: string,
  schemaPath: string,
): Promise<z.ZodType> {
  const location = path.join(root, schemaPath);
  const module = await import(location);
  const schema = module.default;
  if (!schema) {
    throw new Error(`Schema at ${location} has no default export.`);
  }
  return schema as z.ZodType;
}

/** True if the value walks and talks like a Zod schema. */
export function isZodSchema(value: unknown): value is z.ZodType {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { safeParse?: unknown }).safeParse === 'function'
  );
}

/** Validate values against a schema, throwing on the first failure. */
export function validateEnv(
  schema: z.ZodType,
  env: unknown,
): Record<string, unknown> {
  const result = schema.safeParse(env);
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as Record<string, unknown>;
}

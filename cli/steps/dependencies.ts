import type {
  ApplyResult,
  CheckResult,
  PackageJson,
  Step,
  StepContext,
} from './types.js';

/** Look up a declared dependency across the three dependency maps. */
function findDep(pkg: PackageJson, name: string): string | undefined {
  return (
    pkg.dependencies?.[name] ??
    pkg.devDependencies?.[name] ??
    pkg.peerDependencies?.[name]
  );
}

function installCommand(requiredZodVersion: string): string {
  return `npm i -S docker-react zod@${requiredZodVersion}`;
}

export const dependenciesStep: Step = {
  key: 'dependencies',
  label: 'dependencies',
  advisory: true,

  async check(ctx: StepContext): Promise<CheckResult> {
    const want = ctx.requiredZodVersion;
    const cmd = installCommand(want);

    const missing: string[] = [];
    if (!findDep(ctx.pkg, 'docker-react')) {
      missing.push('docker-react');
    }
    const zod = findDep(ctx.pkg, 'zod');
    if (!zod) {
      missing.push(`zod@${want}`);
    }
    if (missing.length > 0) {
      return {
        ok: false,
        severity: 'error',
        message: `missing ${missing.join(', ')}`,
        detail: `Install with \`${cmd}\`.`,
      };
    }

    if (zod !== want) {
      return {
        ok: false,
        severity: 'error',
        message: `zod \`${zod}\` does not match the required \`${want}\``,
        detail: `Pin zod to the exact peer version: \`${cmd}\`.`,
      };
    }

    return {
      ok: true,
      severity: 'error',
      message: `docker-react present, zod pinned to ${want}`,
    };
  },

  async apply(ctx: StepContext): Promise<ApplyResult> {
    // Advisory: never runs npm. init reports the check() guidance instead.
    return {
      changed: false,
      message: `install manually: \`${installCommand(ctx.requiredZodVersion)}\``,
    };
  },
};

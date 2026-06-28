import type { InitCheckOptions } from '../options.js';

export type Severity = 'error' | 'warn';

export interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface StepContext {
  /** Absolute consumer project root (cwd). */
  root: string;
  /** Parsed consumer package.json. */
  pkg: PackageJson;
  /** Resolved CLI flags (force, html, buildDir, envFile, ...). */
  options: InitCheckOptions;
  /** This CLI's own version -> Dockerfile FROM tag. */
  selfVersion: string;
  /** Our peerDependencies.zod (exact) -> dependency check. */
  requiredZodVersion: string;
}

export interface CheckResult {
  ok: boolean;
  /** 'error' = hard fail (exit 1); 'warn' = soft (exit 0). */
  severity: Severity;
  /** One-line status for the report. */
  message: string;
  /** Guidance shown when !ok. */
  detail?: string;
}

export interface ApplyResult {
  /** false = already satisfied / skipped (idempotent no-op). */
  changed: boolean;
  message: string;
  /** Divergent file left untouched; needs --force. */
  conflict?: boolean;
}

export interface Step {
  /** Stable id, e.g. 'dockerignore' (future --only/--skip). */
  key: string;
  /** Short report label. */
  label: string;
  /** Steps 1 & 7: apply() only reports, never mutates. */
  advisory?: boolean;
  check(ctx: StepContext): Promise<CheckResult>;
  /** Idempotent; honors options.force. */
  apply(ctx: StepContext): Promise<ApplyResult>;
}

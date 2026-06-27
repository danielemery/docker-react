import type { CheckResult } from './steps/types.js';

export interface StepCheck {
  label: string;
  result: CheckResult;
}

/**
 * Render a per-step status table + summary. Returns the process exit code:
 * 1 if any check failed at 'error' severity, 0 otherwise (warnings never fail).
 */
export function renderCheckReport(checks: StepCheck[]): number {
  let hardFailures = 0;
  let warnings = 0;

  for (const { label, result } of checks) {
    const icon = result.ok ? '✓' : result.severity === 'warn' ? '!' : '✗';
    console.log(`  ${icon} ${label} — ${result.message}`);
    if (!result.ok && result.detail) {
      console.log(`      ${result.detail}`);
    }
    if (!result.ok) {
      if (result.severity === 'error') {
        hardFailures++;
      } else {
        warnings++;
      }
    }
  }

  const passed = checks.length - hardFailures - warnings;
  const parts = [`${passed}/${checks.length} checks passed`];
  if (warnings > 0) {
    parts.push(`${warnings} warning(s)`);
  }
  if (hardFailures > 0) {
    parts.push(`${hardFailures} failure(s)`);
  }
  console.log('');
  console.log(parts.join(', '));

  return hardFailures > 0 ? 1 : 0;
}

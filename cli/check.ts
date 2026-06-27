import { Command } from 'commander';

import { buildContext } from './project.js';
import { renderCheckReport } from './report.js';
import type { StepCheck } from './report.js';
import { steps } from './steps/index.js';

export function addCheckCommand(program: Command) {
  return program
    .command('check')
    .description('Validate that consumer setup steps have been performed')
    .action(async () => {
      const ctx = await buildContext({});
      const checks: StepCheck[] = [];
      for (const step of steps) {
        const result = await step.check(ctx);
        checks.push({ label: step.label, result });
      }
      process.exitCode = renderCheckReport(checks);
    });
}

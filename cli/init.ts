import { Command } from 'commander';

import type { InitCheckOptions } from './options.js';
import { buildContext } from './project.js';
import { steps } from './steps/index.js';

export function addInitCommand(program: Command) {
  return program
    .command('init')
    .description('Perform consumer setup steps (idempotent)')
    .option('-f, --force', 'Overwrite divergent existing files')
    .option(
      '-b, --build-dir <dir>',
      'Build output directory to serve (overrides Vite-config auto-detection)',
    )
    .action(async (options: InitCheckOptions) => {
      const ctx = await buildContext(options);
      let conflicts = 0;

      for (const step of steps) {
        if (step.advisory) {
          const result = await step.check(ctx);
          const icon = result.ok ? '✓' : '•';
          console.log(`${icon} ${step.label}: ${result.message}`);
          if (!result.ok && result.detail) {
            console.log(`    ${result.detail}`);
          }
          continue;
        }

        const current = await step.check(ctx);
        if (current.ok) {
          console.log(`✓ ${step.label}: already satisfied`);
          continue;
        }

        const result = await step.apply(ctx);
        if (result.conflict) {
          conflicts++;
          console.log(`✗ ${step.label}: ${result.message}`);
        } else {
          console.log(
            `${result.changed ? '+' : '✓'} ${step.label}: ${result.message}`,
          );
        }
      }

      if (conflicts > 0) {
        process.exitCode = 1;
      }
    });
}

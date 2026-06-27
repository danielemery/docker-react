import { Command } from 'commander';

import { addCheckCommand } from './check.js';
import { addInitCommand } from './init.js';
import { addPrepCommand } from './prep.js';

export function cli(args: string[]) {
  const program = new Command();

  addPrepCommand(program);
  addInitCommand(program);
  addCheckCommand(program);

  return program.parseAsync(args);
}

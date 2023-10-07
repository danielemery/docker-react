import { Command } from 'commander';

import { addPrepCommand } from './prep.js';
import { addSetupCommand } from './setup.js';

export function cli(args: string[]) {
  const program = new Command();

  addPrepCommand(program);
  addSetupCommand(program);

  program.parse(args);
}

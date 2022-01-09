import { Command } from 'commander';

import { addPrepCommand } from './prep.js';

export function cli(args: string[]) {
  const program = new Command();

  addPrepCommand(program);

  program.parse(args);
}

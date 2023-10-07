import { Command } from 'commander';

export function addSetupCommand(program: Command) {
  return program
    .command('setup')
    .description('Setup the application to work with docker-react')
    .action(() => {
      console.log('Setup started');
    });
}

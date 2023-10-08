import { Command } from 'commander';
import { SetupOptions } from './options.js';
import { writeSchemaFile } from './file.js';

export function addSetupCommand(program: Command) {
  return program
    .command('setup')
    .description('Setup the application to work with docker-react')
    .option('-s, --schema [string]', 'The path to the schema file')
    .action(async (options: SetupOptions) => {
      const { schema = './env.schema.js' } = options;

      console.log('Validating presence of environment variable schema.');
      const fullSchemaPath = `${process.cwd()}/${schema}`;
      let schemaFile;
      try {
        schemaFile = await import(fullSchemaPath);
      } catch (err: unknown) {
        if ((err as any)?.code === 'ERR_MODULE_NOT_FOUND') {
          console.log(
            `Schema file not found at ${fullSchemaPath}, creating an example now...`,
          );
          await writeSchemaFile(fullSchemaPath);
        } else {
          console.error(err);
          process.exit(1);
        }
      }

      console.log('Validating schema file contents');
      if (
        schemaFile.default['type'] === 'object' &&
        schemaFile.default['validate'] instanceof Function
      ) {
        console.log('Schema file appears to be valid');
      } else {
        console.error("Schema file doesn't appear to be a Joi object schema");
        process.exit(1);
      }
    });
}

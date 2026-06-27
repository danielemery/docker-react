import { promises as fs } from 'fs';
import path from 'path';

import { Command } from 'commander';
import type { Options } from './options.js';
import { loadSchema, validateEnv } from './schema-loader.js';

const ENVIRONMENT_DEFINITION_FILE_NAME = 'window.env.js';

export function addPrepCommand(program: Command) {
  return program
    .command('prep')
    .description('Prepare the application for serving')
    .option('-s, --schema [string]', 'The path to the schema file')
    .option('-d, --destination [string]', 'The path to the destination')
    .action((options: Options) => {
      const {
        schema = './env.schema.js',
        destination = './',
      } = options;
      generateEnvironmentFile(schema, destination);
    });
}

async function generateEnvironmentFile(
  schemaPath: string,
  destinationPath: string,
) {
  // Perform environment variable validation.
  console.log(
    `Attempting to load schema from ${path.join(process.cwd(), schemaPath)}`,
  );
  const envSchema = await loadSchema(process.cwd(), schemaPath);
  console.log('Validating environment variables');
  const validatedWindowVariables = validateEnv(envSchema, process.env);

  // Prepare file and calculate hash
  console.log('Attempting to generate environment file.');
  const mappedWindowVariables = Object.entries(validatedWindowVariables).map(
    (entry) => `${entry[0]}:'${entry[1]}'`,
  );
  const windowVariablesToBeWrittenToFile = `window.env={${mappedWindowVariables}};`;

  const envFileDestination = path.join(
    destinationPath,
    ENVIRONMENT_DEFINITION_FILE_NAME,
  );
  console.log(`Writing window env file to ${envFileDestination}`);
  await fs.writeFile(
    envFileDestination,
    windowVariablesToBeWrittenToFile,
    'utf8',
  );
}

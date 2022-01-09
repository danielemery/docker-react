import path from 'path';
import { promises as fs } from 'fs';

import { Command } from 'commander';
import dotenv from 'dotenv';
import Joi from 'joi';

import { Environment, Options } from './options.js';

const ENVIRONMENT_DEFINITION_FILE_NAME = 'window.env.js';

export function addPrepCommand(program: Command) {
  return program
    .command('prep')
    .description('Prepare the application for serving')
    .option(
      '-e, --environment [string]',
      'The environment to run preparation over',
      'docker',
    )
    .option('-s, --schema [string]', 'The path to the schema file')
    .option('-d, --destination [string', 'The path to the destination')
    .action((options: Options) => {
      const {
        environment,
        schema = './joi.schema.js',
        destination = './',
      } = options;
      generateEnvironmentFile(environment, schema, destination);
    });
}

function validateEnvironmentVariables(
  schema: Joi.Schema,
  environmentVariables: any,
): any {
  const joiResult = schema.validate(environmentVariables, {
    allowUnknown: true,
    abortEarly: false,
    stripUnknown: true,
  });

  if (joiResult.error) {
    throw new Error(joiResult.error.message);
  }

  return joiResult.value;
}

async function generateEnvironmentFile(
  environment: Environment,
  schemaPath: string,
  destinationPath: string,
) {
  // For local environments attempt to load from `.env` files if available.
  if (environment === 'local') {
    const result = dotenv.config();
    if (result.error) {
      throw result.error;
    }
  }

  // Perform environment variable validation.
  const schemaLocation = path.join(process.cwd(), schemaPath);
  console.log(`Attempting to load schema from ${schemaLocation}`);
  const providedSchema = await import(schemaLocation);
  // const envSchema = baseSchema.concat(providedSchema);
  const envSchema = providedSchema.default;
  console.log('Validating environment variables');
  const validatedWindowVariables = validateEnvironmentVariables(
    envSchema,
    process.env,
  );

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

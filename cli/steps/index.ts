import { dockerfileStep } from './dockerfile.js';
import { dockerignoreStep } from './dockerignore.js';
import { schemaStep } from './schema.js';
import type { Step } from './types.js';

/** The single ordered source of truth shared by `init` and `check`. */
export const steps: Step[] = [schemaStep, dockerfileStep, dockerignoreStep];

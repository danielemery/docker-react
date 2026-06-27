import { dockerfileStep } from './dockerfile.js';
import { dockerignoreStep } from './dockerignore.js';
import { indexHtmlStep } from './index-html.js';
import { schemaStep } from './schema.js';
import type { Step } from './types.js';

/** The single ordered source of truth shared by `init` and `check`. */
export const steps: Step[] = [
  schemaStep,
  indexHtmlStep,
  dockerfileStep,
  dockerignoreStep,
];

export type Environment = 'local' | 'docker';

export interface Options {
  environment: Environment;
  schema: string;
  destination: string;
}

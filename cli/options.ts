export type Environment = 'local' | 'docker';

export interface PrepOptions {
  environment: Environment;
  schema: string;
  destination: string;
}

export interface SetupOptions {
  schema: string;
}

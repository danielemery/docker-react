export interface Options {
  schema: string;
  destination: string;
}

export interface InitCheckOptions {
  /** Overwrite divergent existing files instead of reporting + skipping. */
  force?: boolean;
  /** Build output directory to serve; overrides Vite-config auto-detection. */
  buildDir?: string;
  /** Path to the HTML entry file; overrides the `index.html` default. */
  html?: string;
  /** Generate the `node --env-file=.env` variant of the init-local script. */
  envFile?: boolean;
}

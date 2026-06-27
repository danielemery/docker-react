export interface Options {
  schema: string;
  destination: string;
}

export interface InitCheckOptions {
  /** Overwrite divergent existing files instead of reporting + skipping. */
  force?: boolean;
  /** Build output directory to serve; overrides Vite-config auto-detection. */
  buildDir?: string;
}

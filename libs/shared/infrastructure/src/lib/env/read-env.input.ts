/**
 * Input of {@link readEnv}.
 */
export interface ReadEnvInput {
  /** Environment variable name, e.g. `DATABASE_URL`. */
  readonly name: string;
  /** Value used when the variable is unset or empty; omit it to make the variable required. */
  readonly defaultValue?: string;
}

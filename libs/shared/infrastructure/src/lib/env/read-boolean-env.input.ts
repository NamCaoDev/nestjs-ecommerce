/**
 * Input of {@link readBooleanEnv}.
 */
export interface ReadBooleanEnvInput {
  /** Environment variable name, e.g. `HTTP_ENABLED`. */
  readonly name: string;
  /** Value used when the variable is unset or empty. */
  readonly defaultValue: boolean;
}

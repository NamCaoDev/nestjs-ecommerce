import { MissingEnvironmentVariableError } from './missing-environment-variable.error';
import { ReadEnvInput } from './read-env.input';

/**
 * Reads an environment variable. An unset or empty variable falls back to `defaultValue`;
 * without a default the variable is required.
 *
 * @param input - Variable name and optional default.
 * @returns The configured value or the default.
 * @throws {MissingEnvironmentVariableError} When a required variable is unset or empty.
 */
export function readEnv({ name, defaultValue }: ReadEnvInput): string {
  const value: string | undefined = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue === undefined) {
    throw new MissingEnvironmentVariableError(name);
  }
  return defaultValue;
}

import { InvalidEnvironmentVariableError } from './invalid-environment-variable.error';
import { ReadBooleanEnvInput } from './read-boolean-env.input';
import { readEnv } from './read-env.util';

/** Accepted spellings, case-insensitive. */
const TRUE_VALUES: readonly string[] = ['true', '1'];
const FALSE_VALUES: readonly string[] = ['false', '0'];

/**
 * Reads a boolean feature flag (`true`/`false`/`1`/`0`, case-insensitive).
 *
 * @param input - Variable name and default.
 * @returns The flag value, or the default when the variable is unset or empty.
 * @throws {InvalidEnvironmentVariableError} For any other value, so a typo never silently flips a flag.
 */
export function readBooleanEnv({
  name,
  defaultValue,
}: ReadBooleanEnvInput): boolean {
  const value: string = readEnv({ name, defaultValue: String(defaultValue) })
    .trim()
    .toLowerCase();
  if (TRUE_VALUES.includes(value)) {
    return true;
  }
  if (FALSE_VALUES.includes(value)) {
    return false;
  }
  throw new InvalidEnvironmentVariableError({
    name,
    value,
    expected: 'true, false, 1 or 0',
  });
}

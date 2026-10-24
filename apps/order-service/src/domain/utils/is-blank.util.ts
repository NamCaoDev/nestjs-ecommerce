/**
 * Checks whether a string is empty or contains only whitespace.
 *
 * @param value - String to inspect.
 * @returns `true` when `value` has no visible characters.
 */
export function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

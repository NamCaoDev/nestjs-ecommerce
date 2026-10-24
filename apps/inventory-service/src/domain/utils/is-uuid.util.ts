/** RFC 9562 UUID (versions 1-8), case-insensitive. */
const UUID_PATTERN: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks whether a string is a well-formed UUID.
 *
 * @param value - Candidate identifier.
 * @returns `true` when `value` is a UUID.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

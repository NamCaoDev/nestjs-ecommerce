/** Keys whose values are never stored in the audit log. */
const SENSITIVE_KEY_PATTERN: RegExp =
  /secret|signature|securehash|password|token|authorization|cookie|card|cvv|cvc|pan|otp/i;

/** Replacement of a masked value. */
const MASK = '***';

/** Deepest nesting copied; deeper values are dropped. */
const MAX_DEPTH = 5;

/**
 * Copies a payload for the audit log with sensitive values masked (signatures, secrets, tokens, card
 * data) and nesting limited.
 *
 * @param value - Payload to store.
 * @param depth - Current nesting level.
 * @returns The sanitised copy.
 */
export function sanitizeAuditPayload(
  value: unknown,
  depth: number = 0,
): unknown {
  if (depth > MAX_DEPTH) {
    return MASK;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown): unknown =>
      sanitizeAuditPayload(item, depth + 1),
    );
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(
      ([key, item]: [string, unknown]): [string, unknown] => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? MASK
          : sanitizeAuditPayload(item, depth + 1),
      ],
    ),
  );
}

/**
 * Recursively freezes a value and every nested object or array it owns.
 * Primitives and already-frozen objects are returned untouched.
 *
 * Note: `Object.freeze` cannot lock internal slots, so a `Date` nested in the value
 * can still be changed through `setTime()`. The domain therefore stores time as epoch milliseconds.
 *
 * @param value - Value to freeze in place.
 * @returns The same value, typed as deeply read-only.
 */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach((nestedValue: unknown): unknown =>
    deepFreeze(nestedValue),
  );
  return Object.freeze(value);
}

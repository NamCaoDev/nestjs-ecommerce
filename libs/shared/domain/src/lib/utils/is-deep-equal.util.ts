/**
 * Compares two values structurally: primitives by `Object.is`, dates by timestamp,
 * arrays and plain objects recursively by their own enumerable keys.
 *
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns `true` when both values are structurally equal.
 */
export function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (!isComparableObject(left) || !isComparableObject(right)) {
    return false;
  }
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }
  return hasEqualOwnEntries(left, right);
}

/**
 * Checks whether a value is a non-null object that can be compared key by key.
 *
 * @param value - Value to inspect.
 * @returns `true` when the value is a non-null object.
 */
function isComparableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks that two objects have the same own enumerable keys with deeply equal values.
 *
 * @param left - First object.
 * @param right - Second object.
 * @returns `true` when every own entry matches.
 */
function hasEqualOwnEntries(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys: string[] = Object.keys(left);
  const rightKeys: string[] = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key: string): boolean =>
      Object.hasOwn(right, key) && isDeepEqual(left[key], right[key]),
  );
}

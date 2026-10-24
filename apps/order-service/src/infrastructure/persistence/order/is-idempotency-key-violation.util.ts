import { isUniqueConstraintViolation } from '@org/shared-infrastructure';

/** Name of the unique index on `orders (customer_id, idempotency_key)`. */
const IDEMPOTENCY_KEY_INDEX = 'orders_customer_id_idempotency_key_key';

/** Column of that index, as reported by engines that expose `meta.target`. */
const IDEMPOTENCY_KEY_COLUMN = 'idempotency_key';

/**
 * Checks whether an error is a unique violation of `orders (customer_id, idempotency_key)`.
 *
 * @param err - Error thrown by Prisma.
 * @returns `true` when the Idempotency-Key was already stored for the customer.
 */
export function isIdempotencyKeyViolation(err: unknown): boolean {
  return isUniqueConstraintViolation({
    error: err,
    indexName: IDEMPOTENCY_KEY_INDEX,
    columnName: IDEMPOTENCY_KEY_COLUMN,
  });
}

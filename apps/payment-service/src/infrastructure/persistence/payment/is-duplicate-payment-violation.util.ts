import { isUniqueConstraintViolation } from '@org/shared-infrastructure';

/** Unique indexes that make a second payment for the same order or request impossible. */
const DUPLICATE_PAYMENT_INDEXES: ReadonlyArray<{
  readonly indexName: string;
  readonly columnName: string;
}> = [
  { indexName: 'payments_order_id_key', columnName: 'order_id' },
  {
    indexName: 'payment_transactions_idempotency_key_key',
    columnName: 'idempotency_key',
  },
] as const;

/**
 * Checks whether an error is a unique violation of `payments.order_id` or of a ledger key.
 *
 * @param err - Error thrown by Prisma.
 * @returns `true` when the order or the request already has a payment.
 */
export function isDuplicatePaymentViolation(err: unknown): boolean {
  return DUPLICATE_PAYMENT_INDEXES.some(
    ({
      indexName,
      columnName,
    }: {
      readonly indexName: string;
      readonly columnName: string;
    }): boolean =>
      isUniqueConstraintViolation({ error: err, indexName, columnName }),
  );
}

import { isUniqueConstraintViolation } from '@org/shared-infrastructure';

/**
 * Checks whether an error is a primary-key violation of `inbox_events`.
 *
 * @param err - Error thrown by Prisma.
 * @returns `true` when the event is already in the inbox.
 */
export function isInboxDuplicate(err: unknown): boolean {
  return isUniqueConstraintViolation({
    error: err,
    indexName: 'inbox_events_pkey',
    columnName: 'id',
  });
}

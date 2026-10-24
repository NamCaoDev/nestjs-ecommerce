import { MarkOutboxFailedInput } from './mark-outbox-failed.input';

/** Longest stored error message. */
const MAX_ERROR_LENGTH = 1_000;

/** $1 = ids, $2 = error. */
const MARK_OUTBOX_FAILED_SQL = `
  UPDATE outbox_events
  SET status = 'PENDING'::outbox_status, locked_until = NULL,
      retry_count = retry_count + 1, last_error = $2
  WHERE id = ANY($1::uuid[])`;

/**
 * Returns claimed rows to `PENDING` for the next run and records the failed attempt.
 *
 * @param input - Prisma client, row ids and failure reason.
 */
export async function markOutboxFailed({
  client,
  ids,
  error,
}: MarkOutboxFailedInput): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await client.$executeRawUnsafe(
    MARK_OUTBOX_FAILED_SQL,
    [...ids],
    error.slice(0, MAX_ERROR_LENGTH),
  );
}

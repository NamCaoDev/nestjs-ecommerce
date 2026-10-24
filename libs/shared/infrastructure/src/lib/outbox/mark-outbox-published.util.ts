import { MarkOutboxPublishedInput } from './mark-outbox-published.input';

/** $1 = ids, $2 = publication time. */
const MARK_OUTBOX_PUBLISHED_SQL = `
  UPDATE outbox_events
  SET status = 'PUBLISHED'::outbox_status, published_at = $2, locked_until = NULL
  WHERE id = ANY($1::uuid[])`;

/**
 * Marks claimed rows as `PUBLISHED` and releases their lease.
 *
 * @param input - Prisma client, row ids and publication time.
 */
export async function markOutboxPublished({
  client,
  ids,
  publishedAt,
}: MarkOutboxPublishedInput): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await client.$executeRawUnsafe(
    MARK_OUTBOX_PUBLISHED_SQL,
    [...ids],
    new Date(publishedAt),
  );
}

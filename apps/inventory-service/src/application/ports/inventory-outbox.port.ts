import { MarkFailedInput } from './mark-failed.input';
import { MarkPublishedInput } from './mark-published.input';
import { OutboxRecord } from './outbox-record.type';

/**
 * Inventory transactional outbox (`outbox_events` in inventory_db). Injected with {@link INVENTORY_OUTBOX_PORT}.
 */
export interface InventoryOutboxPort {
  /**
   * Claims pending events for this relay instance (lease, `SKIP LOCKED`).
   *
   * @param limit - Maximum number of events.
   * @returns The claimed events, oldest first.
   */
  claimPendingBatch(limit: number): Promise<OutboxRecord[]>;

  /**
   * @param input - Event ids and publication time.
   */
  markPublished(input: MarkPublishedInput): Promise<void>;

  /**
   * Returns events to `PENDING` and records the failed attempt.
   *
   * @param input - Event ids and failure reason.
   */
  markFailed(input: MarkFailedInput): Promise<void>;
}

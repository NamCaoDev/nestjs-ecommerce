import { MarkFailedInput } from './mark-failed.input';
import { MarkPublishedInput } from './mark-published.input';
import { OutboxMessage } from './outbox-message.type';

/**
 * Access to the transactional outbox (`outbox_events`). Injected with {@link OUTBOX_EVENT_REPOSITORY_PORT}.
 */
export interface OutboxEventRepositoryPort {
  /**
   * Claims pending messages for this relay instance so no other instance publishes them meanwhile.
   *
   * @param limit - Maximum number of messages.
   * @returns The claimed messages, oldest first.
   */
  claimPendingBatch(limit: number): Promise<OutboxMessage[]>;

  /**
   * Marks messages as `PUBLISHED`.
   *
   * @param input - Message ids and publication time.
   */
  markPublished(input: MarkPublishedInput): Promise<void>;

  /**
   * Records a failed attempt: increments `retry_count`, stores the error and returns the messages to `PENDING`.
   *
   * @param input - Message ids and failure reason.
   */
  markFailed(input: MarkFailedInput): Promise<void>;
}

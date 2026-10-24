import { Result } from '@org/shared-domain';
import { DuplicateInboxEventError } from '../errors/duplicate-inbox-event.error';
import { InboxEntry } from './inbox-entry.type';
import { SaveOrderWithInboxEntryInput } from './save-order-with-inbox-entry.input';

/**
 * Transactional inbox of the order service (`inbox_events`). Injected with {@link INBOX_PORT}.
 */
export interface InboxPort {
  /**
   * @param eventId - Event id.
   * @returns `true` when the event was already processed.
   */
  hasProcessed(eventId: string): Promise<boolean>;

  /**
   * Records an event that changed nothing (e.g. the order already had the target status), so a
   * redelivery is skipped. A duplicate is ignored.
   *
   * @param entry - Processed event.
   */
  saveProcessed(entry: InboxEntry): Promise<void>;

  /**
   * In one local ACID transaction: updates the order (optimistic version), appends its domain events to
   * the outbox and records the event in the inbox; then clears the events.
   *
   * @param input - Changed order and the event that changed it.
   * @returns Success, or a {@link DuplicateInboxEventError} when a concurrent delivery recorded the event
   *   first (nothing is written).
   * @throws {OrderConcurrencyConflictError} When the order changed in storage since it was loaded.
   */
  saveOrderWithEntry(
    input: SaveOrderWithInboxEntryInput,
  ): Promise<Result<void, DuplicateInboxEventError>>;
}

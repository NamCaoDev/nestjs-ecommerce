import { DomainEvent } from '@org/shared-domain';
import { AuditEntry } from '../../domain/ports/audit-entry.type';
import { DomainEventAuditInput } from './domain-event-audit.input';

/**
 * Turns one kind of payment domain event into an activity-log row. Handlers run synchronously while the
 * use case prepares its save, so the rows are written in the same transaction as the change they record.
 */
export interface DomainEventAuditHandler {
  /**
   * @param event - Domain event raised by the Payment aggregate.
   * @returns `true` when this handler records the event.
   */
  canHandle(event: DomainEvent): boolean;

  /**
   * @param input - Event and actor.
   * @returns The activity row.
   */
  toAuditEntry(input: DomainEventAuditInput<DomainEvent>): AuditEntry;
}

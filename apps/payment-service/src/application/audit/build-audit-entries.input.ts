import { DomainEvent } from '@org/shared-domain';
import { AuditActor } from './audit-actor.type';

/**
 * Input of {@link PaymentDomainEventAuditor.buildAuditEntries}.
 */
export interface BuildAuditEntriesInput {
  /** Pending events of the aggregate, in the order they were raised. */
  readonly events: readonly DomainEvent[];
  readonly actor: AuditActor;
}

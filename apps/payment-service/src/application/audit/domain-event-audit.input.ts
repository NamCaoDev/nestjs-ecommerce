import { DomainEvent } from '@org/shared-domain';
import { AuditActor } from './audit-actor.type';

/**
 * Input of {@link DomainEventAuditHandler.toAuditEntry}.
 */
export interface DomainEventAuditInput<TEvent extends DomainEvent> {
  readonly event: TEvent;
  readonly actor: AuditActor;
}

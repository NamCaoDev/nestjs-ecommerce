import { Injectable } from '@nestjs/common';
import { DomainEvent } from '@org/shared-domain';
import { PaymentStatusChangedDomainEvent } from '../../domain/events/payment-status-changed.domain-event';
import { AuditEntry } from '../../domain/ports/audit-entry.type';
import { AUDIT_ACTIONS } from './audit-actions';
import { DomainEventAuditHandler } from './domain-event-audit-handler.interface';
import { DomainEventAuditInput } from './domain-event-audit.input';

/**
 * Records `STATE_CHANGED` on every payment status transition.
 */
@Injectable()
export class PaymentStatusChangedAuditHandler implements DomainEventAuditHandler {
  /**
   * @param event - Domain event.
   * @returns `true` for a {@link PaymentStatusChangedDomainEvent}.
   */
  public canHandle(event: DomainEvent): boolean {
    return event instanceof PaymentStatusChangedDomainEvent;
  }

  /**
   * @param input - Event and actor.
   * @returns The activity row.
   */
  public toAuditEntry({
    event,
    actor,
  }: DomainEventAuditInput<DomainEvent>): AuditEntry {
    const changed: PaymentStatusChangedDomainEvent =
      event as PaymentStatusChangedDomainEvent;
    return {
      ...actor,
      paymentId: changed.aggregateId,
      transactionId: changed.transactionId,
      action: AUDIT_ACTIONS.STATE_CHANGED,
      stateFrom: changed.from,
      stateTo: changed.to,
      payload: {
        totalAmount: changed.totalAmount,
        refundedAmount: changed.refundedAmount,
        currency: changed.currency,
        ...(changed.failureReason !== undefined && {
          failureReason: changed.failureReason,
        }),
      },
      occurredAt: changed.occurredAt,
    };
  }
}

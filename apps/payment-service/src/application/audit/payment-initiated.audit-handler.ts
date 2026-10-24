import { Injectable } from '@nestjs/common';
import { DomainEvent } from '@org/shared-domain';
import { PaymentInitiatedDomainEvent } from '../../domain/events/payment-initiated.domain-event';
import { AuditEntry } from '../../domain/ports/audit-entry.type';
import { AUDIT_ACTIONS } from './audit-actions';
import { DomainEventAuditHandler } from './domain-event-audit-handler.interface';
import { DomainEventAuditInput } from './domain-event-audit.input';

/**
 * Records `PAYMENT_INITIATED` when the first charge is opened at a gateway.
 */
@Injectable()
export class PaymentInitiatedAuditHandler implements DomainEventAuditHandler {
  /**
   * @param event - Domain event.
   * @returns `true` for a {@link PaymentInitiatedDomainEvent}.
   */
  public canHandle(event: DomainEvent): boolean {
    return event instanceof PaymentInitiatedDomainEvent;
  }

  /**
   * @param input - Event and actor.
   * @returns The activity row.
   */
  public toAuditEntry({
    event,
    actor,
  }: DomainEventAuditInput<DomainEvent>): AuditEntry {
    const initiated: PaymentInitiatedDomainEvent =
      event as PaymentInitiatedDomainEvent;
    return {
      ...actor,
      paymentId: initiated.aggregateId,
      transactionId: initiated.transactionId,
      action: AUDIT_ACTIONS.PAYMENT_INITIATED,
      stateTo: 'PENDING',
      payload: {
        orderId: initiated.orderId,
        gateway: initiated.gateway,
        channel: initiated.channel,
        amount: initiated.amount,
        currency: initiated.currency,
      },
      occurredAt: initiated.occurredAt,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { DomainEvent } from '@org/shared-domain';
import { PaymentTransactionFinalizedDomainEvent } from '../../domain/events/payment-transaction-finalized.domain-event';
import { AuditEntry } from '../../domain/ports/audit-entry.type';
import { AUDIT_ACTIONS } from './audit-actions';
import { DomainEventAuditHandler } from './domain-event-audit-handler.interface';
import { DomainEventAuditInput } from './domain-event-audit.input';

/**
 * Records `TRANSACTION_FINALIZED` when a ledger entry reaches its final status.
 */
@Injectable()
export class PaymentTransactionFinalizedAuditHandler implements DomainEventAuditHandler {
  /**
   * @param event - Domain event.
   * @returns `true` for a {@link PaymentTransactionFinalizedDomainEvent}.
   */
  public canHandle(event: DomainEvent): boolean {
    return event instanceof PaymentTransactionFinalizedDomainEvent;
  }

  /**
   * @param input - Event and actor.
   * @returns The activity row.
   */
  public toAuditEntry({
    event,
    actor,
  }: DomainEventAuditInput<DomainEvent>): AuditEntry {
    const finalized: PaymentTransactionFinalizedDomainEvent =
      event as PaymentTransactionFinalizedDomainEvent;
    return {
      ...actor,
      paymentId: finalized.aggregateId,
      transactionId: finalized.transactionId,
      action: AUDIT_ACTIONS.TRANSACTION_FINALIZED,
      stateFrom: finalized.type === 'CHARGE' ? 'PENDING' : undefined,
      stateTo: finalized.status,
      payload: {
        type: finalized.type,
        gatewayTxId: finalized.gatewayTxId,
        amount: finalized.amount,
        currency: finalized.currency,
        ...(finalized.failureReason !== undefined && {
          failureReason: finalized.failureReason,
        }),
      },
      occurredAt: finalized.occurredAt,
    };
  }
}

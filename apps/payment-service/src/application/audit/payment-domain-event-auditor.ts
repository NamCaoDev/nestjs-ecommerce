import { Injectable } from '@nestjs/common';
import { DomainEvent } from '@org/shared-domain';
import { AuditEntry } from '../../domain/ports/audit-entry.type';
import { BuildAuditEntriesInput } from './build-audit-entries.input';
import { DomainEventAuditHandler } from './domain-event-audit-handler.interface';
import { PaymentInitiatedAuditHandler } from './payment-initiated.audit-handler';
import { PaymentStatusChangedAuditHandler } from './payment-status-changed.audit-handler';
import { PaymentTransactionFinalizedAuditHandler } from './payment-transaction-finalized.audit-handler';

/**
 * Dispatches the pending domain events of a payment to their audit handlers and collects the activity
 * rows, which the repository writes in the same transaction as the payment.
 */
@Injectable()
export class PaymentDomainEventAuditor {
  private readonly handlers: readonly DomainEventAuditHandler[];

  /**
   * @param initiatedHandler - `PaymentInitiatedDomainEvent` handler.
   * @param finalizedHandler - `PaymentTransactionFinalizedDomainEvent` handler.
   * @param statusChangedHandler - `PaymentStatusChangedDomainEvent` handler.
   */
  public constructor(
    initiatedHandler: PaymentInitiatedAuditHandler,
    finalizedHandler: PaymentTransactionFinalizedAuditHandler,
    statusChangedHandler: PaymentStatusChangedAuditHandler,
  ) {
    this.handlers = [initiatedHandler, finalizedHandler, statusChangedHandler];
  }

  /**
   * @param input - Pending events and actor.
   * @returns One activity row per audited event, in event order.
   */
  public buildAuditEntries({
    events,
    actor,
  }: BuildAuditEntriesInput): AuditEntry[] {
    return events.flatMap((event: DomainEvent): AuditEntry[] =>
      this.handlers
        .filter((handler: DomainEventAuditHandler): boolean =>
          handler.canHandle(event),
        )
        .map((handler: DomainEventAuditHandler): AuditEntry =>
          handler.toAuditEntry({ event, actor }),
        ),
    );
  }
}

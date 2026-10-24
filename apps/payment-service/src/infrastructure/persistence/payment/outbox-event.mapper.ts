import { PaymentFailedPayload, PaymentSucceededPayload } from '@org/contracts';
import { DomainEvent } from '@org/shared-domain';
import { PaymentStatusChangedDomainEvent } from '../../../domain/events/payment-status-changed.domain-event';
import { Prisma } from '../prisma/generated/client';

/** Aggregate type stored on every payment outbox message. */
const PAYMENT_AGGREGATE_TYPE = 'Payment';

/** Integration event published when a payment becomes PAID. */
const PAYMENT_SUCCEEDED = 'payment.succeeded';

/** Integration event published when a payment becomes FAILED. */
const PAYMENT_FAILED = 'payment.failed';

/**
 * Maps payment domain events to the integration events of `payments.events` (`@org/contracts`):
 * a transition to PAID publishes `payment.succeeded`, to FAILED `payment.failed`. Other events
 * (initiation, ledger entries, refunds) stay internal and are only audited.
 */
export class OutboxEventMapper {
  /**
   * @param events - Pending domain events of a payment.
   * @returns The outbox rows to write; their ids are the event ids, so consumers can deduplicate.
   */
  public static toCreateInputs(
    events: readonly DomainEvent[],
  ): Prisma.OutboxEventCreateManyInput[] {
    return events
      .filter(
        (event: DomainEvent): event is PaymentStatusChangedDomainEvent =>
          event instanceof PaymentStatusChangedDomainEvent &&
          (event.to === 'PAID' || event.to === 'FAILED'),
      )
      .map(
        (
          event: PaymentStatusChangedDomainEvent,
        ): Prisma.OutboxEventCreateManyInput => ({
          id: event.eventId,
          aggregateType: PAYMENT_AGGREGATE_TYPE,
          aggregateId: event.aggregateId,
          eventType: event.to === 'PAID' ? PAYMENT_SUCCEEDED : PAYMENT_FAILED,
          payload: OutboxEventMapper.toPayload(event),
          occurredAt: new Date(event.occurredAt),
        }),
      );
  }

  /**
   * @returns The `payment.succeeded` or `payment.failed` payload.
   */
  private static toPayload(
    event: PaymentStatusChangedDomainEvent,
  ): Prisma.InputJsonObject {
    if (event.to === 'PAID') {
      const payload: PaymentSucceededPayload = {
        paymentId: event.aggregateId,
        orderId: event.orderId,
        amount: event.totalAmount,
        currency: event.currency,
        gatewayTxId: event.gatewayTxId,
        items: event.lines,
        succeededAt: event.occurredAt,
      };
      return payload as unknown as Prisma.InputJsonObject;
    }
    const payload: PaymentFailedPayload = {
      paymentId: event.aggregateId,
      orderId: event.orderId,
      gatewayTxId: event.gatewayTxId,
      reason: event.failureReason ?? event.to,
      items: event.lines,
      failedAt: event.occurredAt,
    };
    return payload as unknown as Prisma.InputJsonObject;
  }
}

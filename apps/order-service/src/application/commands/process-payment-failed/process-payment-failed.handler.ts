import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { PaymentOutcome } from '../../services/payment-outcome.type';
import { PaymentOutcomeProcessor } from '../../services/payment-outcome-processor.service';
import { ProcessPaymentFailedCommand } from './process-payment-failed.command';

/** Service that publishes payment events. */
const PAYMENT_SOURCE = 'payment-service';

/** Event type recorded in the inbox. */
const PAYMENT_FAILED = 'payment.failed';

/** Prefix of the cancellation reason of an unpaid order. */
const PAYMENT_FAILED_REASON_PREFIX = 'PAYMENT_FAILED';

/**
 * `payment.failed` → order CANCELLED (PENDING only) with `order.cancelled` in the outbox, the inbox row in
 * the same transaction. The inventory releases the stock from the same event. Redeliveries are skipped
 * through the inbox.
 */
@CommandHandler(ProcessPaymentFailedCommand)
export class ProcessPaymentFailedHandler implements ICommandHandler<
  ProcessPaymentFailedCommand,
  Result<PaymentOutcome, DomainError>
> {
  /**
   * @param processor - Exactly-once application of payment outcomes.
   */
  public constructor(private readonly processor: PaymentOutcomeProcessor) {}

  /**
   * @param command - Event id, correlation id, order, reason and payload.
   * @returns What was done, or why the order cannot be cancelled.
   */
  public execute(
    command: ProcessPaymentFailedCommand,
  ): Promise<Result<PaymentOutcome, DomainError>> {
    return this.processor.execute({
      entry: {
        eventId: command.eventId,
        eventType: PAYMENT_FAILED,
        source: PAYMENT_SOURCE,
        payload: command.payload,
      },
      orderId: command.orderId,
      correlationId: command.correlationId,
      targetStatus: OrderStatus.CANCELLED,
      transition: (order: Order): Result<void, DomainError> =>
        order.cancel(`${PAYMENT_FAILED_REASON_PREFIX}: ${command.reason}`),
    });
  }
}

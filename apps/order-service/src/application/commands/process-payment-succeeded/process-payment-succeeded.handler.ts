import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { PaymentOutcome } from '../../services/payment-outcome.type';
import { PaymentOutcomeProcessor } from '../../services/payment-outcome-processor.service';
import { ProcessPaymentSucceededCommand } from './process-payment-succeeded.command';

/** Service that publishes payment events. */
const PAYMENT_SOURCE = 'payment-service';

/** Event type recorded in the inbox. */
const PAYMENT_SUCCEEDED = 'payment.succeeded';

/**
 * `payment.succeeded` → order CONFIRMED (PENDING only) with `order.confirmed` in the outbox, the inbox row
 * in the same transaction. Redeliveries are skipped through the inbox.
 */
@CommandHandler(ProcessPaymentSucceededCommand)
export class ProcessPaymentSucceededHandler implements ICommandHandler<
  ProcessPaymentSucceededCommand,
  Result<PaymentOutcome, DomainError>
> {
  /**
   * @param processor - Exactly-once application of payment outcomes.
   */
  public constructor(private readonly processor: PaymentOutcomeProcessor) {}

  /**
   * @param command - Event id, correlation id, order and payload.
   * @returns What was done, or why the order cannot be confirmed.
   */
  public execute(
    command: ProcessPaymentSucceededCommand,
  ): Promise<Result<PaymentOutcome, DomainError>> {
    return this.processor.execute({
      entry: {
        eventId: command.eventId,
        eventType: PAYMENT_SUCCEEDED,
        source: PAYMENT_SOURCE,
        payload: command.payload,
      },
      orderId: command.orderId,
      correlationId: command.correlationId,
      targetStatus: OrderStatus.CONFIRMED,
      transition: (order: Order): Result<void, DomainError> => order.confirm(),
    });
  }
}

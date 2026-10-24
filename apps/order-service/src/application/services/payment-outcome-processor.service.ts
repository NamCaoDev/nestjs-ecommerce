import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../domain/aggregates/order.aggregate';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import type { OrderRepositoryPort } from '../../domain/ports/order-repository.port';
import { ORDER_REPOSITORY_PORT } from '../../domain/ports/order-repository.token';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import { DuplicateInboxEventError } from '../errors/duplicate-inbox-event.error';
import type { InboxPort } from '../ports/inbox.port';
import { INBOX_PORT } from '../ports/inbox.token';
import { PaymentOutcome } from './payment-outcome.type';
import { ProcessPaymentOutcomeInput } from './process-payment-outcome.input';

/**
 * Applies a payment outcome (`payment.succeeded` / `payment.failed`) to its order exactly once, through
 * the transactional inbox:
 * 1. an event already in the inbox is skipped (idempotent bypass);
 * 2. the order moves through its domain method; the order update, its outbox events and the inbox row
 *    are written in one ACID transaction;
 * 3. an order already in the target status, or one the event cannot move, gets only the inbox row, so a
 *    redelivery is skipped;
 * 4. a concurrent delivery that recorded the event first makes the second one a no-op, not an error.
 */
@Injectable()
export class PaymentOutcomeProcessor {
  private readonly logger: Logger = new Logger(PaymentOutcomeProcessor.name);

  /**
   * @param orderRepository - Loads the order.
   * @param inbox - Transactional inbox.
   */
  public constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: OrderRepositoryPort,
    @Inject(INBOX_PORT) private readonly inbox: InboxPort,
  ) {}

  /**
   * @param input - Event, order, target status and transition.
   * @returns What was done, or the reason the event cannot apply.
   */
  public async execute(
    input: ProcessPaymentOutcomeInput,
  ): Promise<Result<PaymentOutcome, DomainError>> {
    if (await this.inbox.hasProcessed(input.entry.eventId)) {
      this.logger.log(
        `Event ${input.entry.eventId} (correlation ${input.correlationId}) already processed; skipped`,
      );
      return Result.ok('DUPLICATE_EVENT');
    }
    const orderResult: Result<Order, DomainError> = await this.findOrder(
      input.orderId,
    );
    if (orderResult.isFailure) {
      return Result.fail(orderResult.getError());
    }
    return this.executeTransition({ ...input, order: orderResult.getValue() });
  }

  /**
   * @returns The order, or why it cannot be loaded.
   */
  private async findOrder(
    orderId: string,
  ): Promise<Result<Order, DomainError>> {
    const idResult: Result<OrderId, DomainError> = OrderId.create(orderId);
    if (idResult.isFailure) {
      return Result.fail(idResult.getError());
    }
    const order: Order | undefined = await this.orderRepository.findById(
      idResult.getValue(),
    );
    return order === undefined
      ? Result.fail(new OrderNotFoundError(orderId))
      : Result.ok(order);
  }

  /**
   * Moves the order and records the event with the change, or records the event alone.
   */
  private async executeTransition({
    entry,
    order,
    targetStatus,
    transition,
  }: ProcessPaymentOutcomeInput & {
    readonly order: Order;
  }): Promise<Result<PaymentOutcome, DomainError>> {
    if (order.status.equals(targetStatus)) {
      await this.inbox.saveProcessed(entry);
      return Result.ok('ALREADY_IN_STATE');
    }
    const transitionResult: Result<void, DomainError> = transition(order);
    if (transitionResult.isFailure) {
      await this.inbox.saveProcessed(entry);
      return Result.fail(transitionResult.getError());
    }
    const saveResult: Result<void, DuplicateInboxEventError> =
      await this.inbox.saveOrderWithEntry({ order, entry });
    return Result.ok(saveResult.isSuccess ? 'APPLIED' : 'DUPLICATE_EVENT');
  }
}

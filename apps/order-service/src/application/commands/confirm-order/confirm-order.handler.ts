import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderNotFoundError } from '../../../domain/errors/order-not-found.error';
import type { OrderRepositoryPort } from '../../../domain/ports/order-repository.port';
import { ORDER_REPOSITORY_PORT } from '../../../domain/ports/order-repository.token';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { ConfirmOrderCommand } from './confirm-order.command';

/**
 * Confirms a pending order after `payment.succeeded` and records `order.confirmed` through the
 * transactional outbox. Idempotent: an order that is already confirmed succeeds without change, so a
 * redelivered message is harmless. A concurrent modification throws, so the message is redelivered.
 */
@CommandHandler(ConfirmOrderCommand)
export class ConfirmOrderHandler implements ICommandHandler<
  ConfirmOrderCommand,
  Result<void, DomainError>
> {
  /**
   * @param orderRepository - Order persistence with transactional outbox.
   */
  public constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}

  /**
   * @param command - Order identifier.
   * @returns Success, or the domain error explaining why the order cannot be confirmed.
   */
  public async execute(
    command: ConfirmOrderCommand,
  ): Promise<Result<void, DomainError>> {
    const orderIdResult: Result<OrderId, DomainError> = OrderId.create(
      command.orderId,
    );
    if (orderIdResult.isFailure) {
      return Result.fail(orderIdResult.getError());
    }
    const order: Order | undefined = await this.orderRepository.findById(
      orderIdResult.getValue(),
    );
    if (order === undefined) {
      return Result.fail(new OrderNotFoundError(command.orderId));
    }
    if (order.status.equals(OrderStatus.CONFIRMED)) {
      return Result.ok();
    }
    const confirmResult: Result<void, DomainError> = order.confirm();
    if (confirmResult.isFailure) {
      return Result.fail(confirmResult.getError());
    }
    await this.orderRepository.updateWithOutbox(order);
    return Result.ok();
  }
}

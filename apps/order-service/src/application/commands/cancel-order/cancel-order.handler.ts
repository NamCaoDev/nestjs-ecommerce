import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderNotFoundError } from '../../../domain/errors/order-not-found.error';
import type { OrderRepositoryPort } from '../../../domain/ports/order-repository.port';
import { ORDER_REPOSITORY_PORT } from '../../../domain/ports/order-repository.token';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { CancelOrderCommand } from './cancel-order.command';

/**
 * Cancels a pending order and records `order.cancelled` through the transactional outbox.
 * Idempotent: an order that is already cancelled succeeds without change, so a redelivered
 * message is harmless. A concurrent modification throws, so the triggering message is redelivered.
 */
@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<
  CancelOrderCommand,
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
   * @param command - Order identifier and reason.
   * @returns Success, or the domain error explaining why the order cannot be cancelled.
   */
  public async execute(
    command: CancelOrderCommand,
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
    if (order.status.equals(OrderStatus.CANCELLED)) {
      return Result.ok();
    }
    const cancelResult: Result<void, DomainError> = order.cancel(
      command.reason,
    );
    if (cancelResult.isFailure) {
      return Result.fail(cancelResult.getError());
    }
    await this.orderRepository.updateWithOutbox(order);
    return Result.ok();
  }
}

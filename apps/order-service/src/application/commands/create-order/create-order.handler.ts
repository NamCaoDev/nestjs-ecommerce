import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { randomUUID } from 'node:crypto';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderItem } from '../../../domain/entities/order-item.entity';
import type { OrderRepositoryPort } from '../../../domain/ports/order-repository.port';
import { ORDER_REPOSITORY_PORT } from '../../../domain/ports/order-repository.token';
import { AddressSnapshot } from '../../../domain/value-objects/address-snapshot.vo';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderCode } from '../../../domain/value-objects/order-code.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import type { IdempotencyPort } from '../../ports/idempotency.port';
import { IDEMPOTENCY_PORT } from '../../ports/idempotency.token';
import { ReleaseLockInput } from '../../ports/release-lock.input';
import type { InventoryRpcPort } from '../../ports/inventory-rpc.port';
import { INVENTORY_RPC_PORT } from '../../ports/inventory-rpc.token';
import { DuplicateRequestError } from '../../errors/duplicate-request.error';
import { ReleaseStockInput } from '../../ports/release-stock.input';
import { buildOrderCode } from '../../utils/build-order-code.util';
import { CreateOrderCommandProps } from './create-order-command.props';
import { CreateOrderCommand } from './create-order.command';
import { CreateOrderOutput } from './create-order.output';

/** How long an Idempotency-Key stays `PROCESSING`; bounds a crashed request: 2 minutes. */
const PROCESSING_TTL_SECONDS = 120;

/** How long a `COMPLETED` Idempotency-Key rejects retries: 24 hours. */
const COMPLETED_TTL_SECONDS = 86_400;

/** One command line together with the order currency. */
type PricedLine = CreateOrderCommandProps['items'][number] & {
  readonly currency: string;
};

/**
 * Places an order:
 * 1. marks the Idempotency-Key as `PROCESSING` (rejecting duplicates),
 * 2. builds and validates the {@link Order} aggregate,
 * 3. reserves stock through the inventory service,
 * 4. persists the order with its outbox events in one transaction,
 * 5. marks the Idempotency-Key as `COMPLETED`.
 *
 * Compensation: once stock may have been reserved, any later failure or crash releases it
 * (`releaseStock` is idempotent), except when the save reports a duplicate Idempotency-Key, because
 * the reservation then belongs to the order already stored under that key.
 * Any failure also releases the Idempotency-Key so the client can retry.
 */
@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<
  CreateOrderCommand,
  Result<CreateOrderOutput, Error>
> {
  private readonly logger: Logger = new Logger(CreateOrderHandler.name);

  /**
   * @param orderRepository - Order persistence with transactional outbox.
   * @param inventoryRpc - Inventory service client.
   * @param idempotency - Idempotency-Key store.
   */
  public constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: OrderRepositoryPort,
    @Inject(INVENTORY_RPC_PORT)
    private readonly inventoryRpc: InventoryRpcPort,
    @Inject(IDEMPOTENCY_PORT)
    private readonly idempotency: IdempotencyPort,
  ) {}

  /**
   * @param command - Order to place.
   * @returns The placed order summary, or the reason it could not be placed.
   */
  public async execute(
    command: CreateOrderCommand,
  ): Promise<Result<CreateOrderOutput, Error>> {
    const lock: ReleaseLockInput = {
      customerId: command.customerId,
      key: command.idempotencyKey,
    };
    const lockResult: Result<void, Error> = await this.idempotency.acquireLock({
      ...lock,
      ttlSeconds: PROCESSING_TTL_SECONDS,
    });
    if (lockResult.isFailure) {
      return Result.fail(lockResult.getError());
    }
    const result: Result<CreateOrderOutput, Error> = await this.executeCreation(
      command,
    ).catch(async (err: unknown): Promise<never> => {
      await this.idempotency.releaseLock(lock);
      throw err;
    });
    if (result.isFailure) {
      await this.idempotency.releaseLock(lock);
      return result;
    }
    await this.idempotency.markCompleted({
      ...lock,
      ttlSeconds: COMPLETED_TTL_SECONDS,
    });
    return result;
  }

  /**
   * Runs steps 2-4 once the Idempotency-Key is held, compensating the stock reservation on failure.
   */
  private async executeCreation(
    command: CreateOrderCommand,
  ): Promise<Result<CreateOrderOutput, Error>> {
    const orderResult: Result<Order, DomainError> =
      CreateOrderHandler.buildOrder(command);
    if (orderResult.isFailure) {
      return Result.fail(orderResult.getError());
    }
    const order: Order = orderResult.getValue();
    const stock: ReleaseStockInput = CreateOrderHandler.toStockInput({
      order,
      idempotencyKey: command.idempotencyKey,
    });
    const reservationResult: Result<void, Error> = await this.inventoryRpc
      .reserveStock(stock)
      .catch(this.buildCompensatingRethrow(stock));
    if (reservationResult.isFailure) {
      return Result.fail(reservationResult.getError());
    }
    const saveResult: Result<void, Error> = await this.orderRepository
      .saveWithOutbox({ order, idempotencyKey: command.idempotencyKey })
      .catch(this.buildCompensatingRethrow(stock));
    if (saveResult.isFailure) {
      await this.executeCompensationUnlessOwnedByExistingOrder({
        stock,
        error: saveResult.getError(),
      });
      return Result.fail(saveResult.getError());
    }
    return Result.ok(CreateOrderHandler.toOutput(order));
  }

  /**
   * Builds a rejection handler that releases the stock, then rethrows the original error.
   * Used where the reservation outcome is unknown (reserve crashed) or must be undone (save crashed).
   */
  private buildCompensatingRethrow(
    stock: ReleaseStockInput,
  ): (err: unknown) => Promise<never> {
    return async (err: unknown): Promise<never> => {
      await this.executeCompensation(stock);
      throw err;
    };
  }

  /**
   * Compensates a failed save, except on a duplicate Idempotency-Key: the reservation is keyed by
   * that same Idempotency-Key, so it belongs to the order already persisted under it and must stay.
   */
  private async executeCompensationUnlessOwnedByExistingOrder({
    stock,
    error,
  }: {
    readonly stock: ReleaseStockInput;
    readonly error: Error;
  }): Promise<void> {
    if (error instanceof DuplicateRequestError) {
      return;
    }
    await this.executeCompensation(stock);
  }

  /**
   * Releases reserved stock. A failed release is logged with its context and never replaces the
   * original failure; the reservation must then be reconciled by the inventory service.
   */
  private async executeCompensation(stock: ReleaseStockInput): Promise<void> {
    await this.inventoryRpc.releaseStock(stock).catch((err: unknown): void => {
      this.logger.error(
        `Stock release failed for Idempotency-Key ${stock.idempotencyKey}`,
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  /**
   * @returns The SKUs and quantities of the order. The reservation key is the Idempotency-Key scoped
   * by customer, so it is stable across retries yet never shared between customers.
   */
  private static toStockInput({
    order,
    idempotencyKey,
  }: {
    readonly order: Order;
    readonly idempotencyKey: string;
  }): ReleaseStockInput {
    return {
      idempotencyKey: `${order.customerId}:${idempotencyKey}`,
      orderId: order.id.value,
      items: order.items.map(
        (item: OrderItem): { skuId: string; quantity: number } => ({
          skuId: item.skuId,
          quantity: item.quantity,
        }),
      ),
    };
  }

  /**
   * @returns The summary returned to the caller.
   */
  private static toOutput(order: Order): CreateOrderOutput {
    const totalAmount: Money = order.totalAmount;
    return {
      orderId: order.id.value,
      orderCode: order.orderCode.value,
      totalAmount: totalAmount.amount,
      currency: totalAmount.currency,
    };
  }

  /**
   * Builds the aggregate from the command, validating every value object on the way.
   */
  private static buildOrder(
    command: CreateOrderCommand,
  ): Result<Order, DomainError> {
    const itemsResult: Result<OrderItem[], DomainError> =
      CreateOrderHandler.buildItems(command);
    if (itemsResult.isFailure) {
      return Result.fail(itemsResult.getError());
    }
    const addressResult: Result<AddressSnapshot, DomainError> =
      AddressSnapshot.create(command.shippingAddress);
    if (addressResult.isFailure) {
      return Result.fail(addressResult.getError());
    }
    const orderId: OrderId = OrderId.create(randomUUID()).getValue();
    return Order.create({
      id: orderId,
      orderCode: OrderCode.create(buildOrderCode(orderId.value)).getValue(),
      customerId: command.customerId,
      items: itemsResult.getValue(),
      shippingAddress: addressResult.getValue(),
    });
  }

  /**
   * Builds every order line, stopping at the first invalid one.
   */
  private static buildItems({
    items,
    currency,
  }: CreateOrderCommand): Result<OrderItem[], DomainError> {
    const itemResults: Result<OrderItem, DomainError>[] = items.map(
      (
        item: CreateOrderCommandProps['items'][number],
      ): Result<OrderItem, DomainError> =>
        CreateOrderHandler.buildItem({ ...item, currency }),
    );
    const failedResult: Result<OrderItem, DomainError> | undefined =
      itemResults.find(
        (itemResult: Result<OrderItem, DomainError>): boolean =>
          itemResult.isFailure,
      );
    if (failedResult !== undefined) {
      return Result.fail(failedResult.getError());
    }
    return Result.ok(
      itemResults.map((itemResult: Result<OrderItem, DomainError>): OrderItem =>
        itemResult.getValue(),
      ),
    );
  }

  /**
   * Builds one order line with its unit price.
   */
  private static buildItem({
    skuId,
    productName,
    quantity,
    unitPrice,
    currency,
  }: PricedLine): Result<OrderItem, DomainError> {
    const priceResult: Result<Money, DomainError> = Money.create({
      amount: unitPrice,
      currency,
    });
    if (priceResult.isFailure) {
      return Result.fail(priceResult.getError());
    }
    return OrderItem.create({
      skuId,
      productName,
      quantity,
      unitPrice: priceResult.getValue(),
    });
  }
}

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { RestockRequest } from '../../../domain/value-objects/restock-request.vo';
import { StockCounters } from '../../ports/stock-counters.type';
import type { StockInboundPort } from '../../ports/stock-inbound.port';
import { STOCK_INBOUND_PORT } from '../../ports/stock-inbound.token';
import { StockLevelReadModel } from '../../read-models/stock-level.read-model';
import { RestockSkuCommand } from './restock-sku.command';

/**
 * Records goods received in a single PostgreSQL transaction: the SKU total, a `RESTOCK` ledger entry
 * and a `stock.restocked` outbox event (applied once per Idempotency-Key). Redis is never written here,
 * so there is no dual write: the inventory outbox relay applies the event to Redis, exactly once,
 * whenever Redis is reachable.
 */
@CommandHandler(RestockSkuCommand)
export class RestockSkuHandler implements ICommandHandler<
  RestockSkuCommand,
  Result<StockLevelReadModel, DomainError>
> {
  /**
   * @param stockInbound - PostgreSQL receipts with transactional outbox.
   */
  public constructor(
    @Inject(STOCK_INBOUND_PORT) private readonly stockInbound: StockInboundPort,
  ) {}

  /**
   * @param command - SKU, units received, reference and Idempotency-Key.
   * @returns The durable stock level after the receipt, or an `InvalidRestockError` / `DuplicateRequestError`.
   */
  public async execute(
    command: RestockSkuCommand,
  ): Promise<Result<StockLevelReadModel, DomainError>> {
    const restockResult: Result<RestockRequest, DomainError> =
      RestockRequest.create({
        skuId: command.skuId,
        quantity: command.additionalQuantity,
        referenceNote: command.referenceNote,
      });
    if (restockResult.isFailure) {
      return Result.fail(restockResult.getError());
    }
    const savedResult: Result<StockCounters, DomainError> =
      await this.stockInbound.saveRestock({
        restock: restockResult.getValue(),
        idempotencyKey: command.idempotencyKey,
      });
    if (savedResult.isFailure) {
      return Result.fail(savedResult.getError());
    }
    const counters: StockCounters = savedResult.getValue();
    return Result.ok({
      skuId: counters.skuId,
      totalQuantity: counters.totalQuantity,
      reservedQuantity: counters.reservedQuantity,
      availableQuantity: counters.totalQuantity - counters.reservedQuantity,
      source: 'DATABASE',
    });
  }
}

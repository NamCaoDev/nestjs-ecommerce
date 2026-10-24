import { Injectable } from '@nestjs/common';
import { isUniqueConstraintViolation } from '@org/shared-infrastructure';
import { Result } from '@org/shared-domain';
import { DuplicateRequestError } from '../../../application/errors/duplicate-request.error';
import { STOCK_RESTOCKED_EVENT_TYPE } from '../../../application/events/stock-restocked.event-type';
import { StockRestockedPayload } from '../../../application/events/stock-restocked.payload';
import { SaveRestockInput } from '../../../application/ports/save-restock.input';
import { StockCounters } from '../../../application/ports/stock-counters.type';
import { StockInboundPort } from '../../../application/ports/stock-inbound.port';
import { RestockRequest } from '../../../domain/value-objects/restock-request.vo';
import { InventoryStock, Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/** Unique index on `stock_ledger.idempotency_key`. */
const IDEMPOTENCY_KEY_INDEX = 'stock_ledger_idempotency_key_key';

/** Aggregate type of inventory outbox events. */
const STOCK_AGGREGATE_TYPE = 'InventoryStock';

/** Column of that index, as reported by engines that expose `meta.target`. */
const IDEMPOTENCY_KEY_COLUMN = 'idempotency_key';

/**
 * Prisma implementation of {@link StockInboundPort}. In one transaction: the stock row is upserted with
 * an atomic increment (a new SKU is created with nothing reserved), a `RESTOCK` ledger entry is
 * inserted, and a `stock.restocked` outbox event is written for the Redis relay (transactional outbox,
 * CLAUDE.md §4.2). The unique Idempotency-Key rolls back a retried request.
 */
@Injectable()
export class StockInboundPrismaRepository implements StockInboundPort {
  /**
   * @param prisma - Client for `inventory_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param input - Validated receipt and its Idempotency-Key.
   * @returns The counters after the receipt, or a {@link DuplicateRequestError} for a reused key.
   */
  public async saveRestock({
    restock,
    idempotencyKey,
  }: SaveRestockInput): Promise<Result<StockCounters, DuplicateRequestError>> {
    try {
      const row: InventoryStock = await this.prisma.client.$transaction(
        async (
          transaction: Prisma.TransactionClient,
        ): Promise<InventoryStock> => {
          const stock: InventoryStock = await transaction.inventoryStock.upsert(
            {
              where: { skuId: restock.skuId },
              create: {
                skuId: restock.skuId,
                totalQuantity: restock.quantity,
                reservedQuantity: 0,
              },
              update: {
                totalQuantity: { increment: restock.quantity },
                version: { increment: 1 },
              },
            },
          );
          await transaction.stockLedger.create({
            data: {
              skuId: restock.skuId,
              quantityChanged: restock.quantity,
              actionType: 'RESTOCK',
              referenceNote: restock.referenceNote ?? null,
              idempotencyKey,
            },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: STOCK_AGGREGATE_TYPE,
              aggregateId: restock.skuId,
              eventType: STOCK_RESTOCKED_EVENT_TYPE,
              payload: StockInboundPrismaRepository.toPayload(restock),
            },
          });
          return stock;
        },
      );
      return Result.ok({
        skuId: row.skuId,
        totalQuantity: row.totalQuantity,
        reservedQuantity: row.reservedQuantity,
      });
    } catch (err: unknown) {
      if (
        isUniqueConstraintViolation({
          error: err,
          indexName: IDEMPOTENCY_KEY_INDEX,
          columnName: IDEMPOTENCY_KEY_COLUMN,
        })
      ) {
        return Result.fail(new DuplicateRequestError(idempotencyKey));
      }
      throw err;
    }
  }

  /**
   * @returns The outbox payload of a receipt.
   */
  private static toPayload(restock: RestockRequest): Prisma.InputJsonObject {
    const payload: StockRestockedPayload = {
      skuId: restock.skuId,
      additionalQuantity: restock.quantity,
    };
    return { ...payload };
  }
}

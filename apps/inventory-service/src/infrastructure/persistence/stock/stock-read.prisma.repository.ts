import { Injectable } from '@nestjs/common';
import { STOCK_RESTOCKED_EVENT_TYPE } from '../../../application/events/stock-restocked.event-type';
import { FindCountersPageInput } from '../../../application/ports/find-counters-page.input';
import { FindLedgerInput } from '../../../application/ports/find-ledger.input';
import { StockReadPort } from '../../../application/ports/stock-read.port';
import { StockSnapshot } from '../../../application/ports/stock-snapshot.type';
import { StockLedgerEntryReadModel } from '../../../application/read-models/stock-ledger-entry.read-model';
import {
  InventoryStock,
  Prisma,
  StockLedger,
} from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/** Pending restock event of a SKU, as selected for a snapshot. */
interface PendingRestockRow {
  readonly id: string;
  readonly aggregateId: string;
}

/**
 * Prisma implementation of {@link StockReadPort}. Stock snapshots read the counters and the
 * not-yet-published `stock.restocked` events of the same SKUs in one REPEATABLE READ transaction, so
 * the events listed are exactly those already included in the counters.
 */
@Injectable()
export class StockReadPrismaRepository implements StockReadPort {
  /**
   * @param prisma - Client for `inventory_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param skuId - SKU UUID.
   * @returns The stored snapshot, or `undefined` for an unknown SKU.
   */
  public async findCounters(skuId: string): Promise<StockSnapshot | undefined> {
    const [snapshot]: StockSnapshot[] = await this.findSnapshots({
      where: { skuId },
    });
    return snapshot;
  }

  /**
   * Uses the `(sku_id, created_at)` index.
   *
   * @param input - SKU and maximum number of entries.
   * @returns The most recent entries, newest first.
   */
  public async findLedger({
    skuId,
    limit,
  }: FindLedgerInput): Promise<StockLedgerEntryReadModel[]> {
    const rows: StockLedger[] = await this.prisma.client.stockLedger.findMany({
      where: { skuId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row: StockLedger): StockLedgerEntryReadModel => ({
      id: row.id,
      skuId: row.skuId,
      actionType: row.actionType,
      quantityChanged: row.quantityChanged,
      orderId: row.orderId,
      reservationKey: row.reservationKey,
      referenceNote: row.referenceNote,
      createdAt: row.createdAt.getTime(),
    }));
  }

  /**
   * @param skuIds - SKU UUIDs.
   * @returns The stored snapshots of the SKUs that exist.
   */
  public findCountersBySkuIds(
    skuIds: readonly string[],
  ): Promise<StockSnapshot[]> {
    return this.findSnapshots({ where: { skuId: { in: [...skuIds] } } });
  }

  /**
   * Keyset pagination on the primary key, so each page is an index range scan.
   *
   * @param input - Last SKU of the previous page and page size.
   * @returns One page ordered by SKU id.
   */
  public findCountersPage({
    afterSkuId,
    limit,
  }: FindCountersPageInput): Promise<StockSnapshot[]> {
    return this.findSnapshots({
      where: afterSkuId === undefined ? {} : { skuId: { gt: afterSkuId } },
      orderBy: { skuId: 'asc' },
      take: limit,
    });
  }

  /**
   * Reads stock rows and their pending receipts in one consistent snapshot.
   */
  private findSnapshots(
    query: Prisma.InventoryStockFindManyArgs,
  ): Promise<StockSnapshot[]> {
    return this.prisma.client.$transaction(
      async (
        transaction: Prisma.TransactionClient,
      ): Promise<StockSnapshot[]> => {
        const rows: InventoryStock[] =
          await transaction.inventoryStock.findMany(query);
        const pending: PendingRestockRow[] =
          rows.length === 0
            ? []
            : await transaction.outboxEvent.findMany({
                where: {
                  eventType: STOCK_RESTOCKED_EVENT_TYPE,
                  status: { not: 'PUBLISHED' },
                  aggregateId: {
                    in: rows.map((row: InventoryStock): string => row.skuId),
                  },
                },
                select: { id: true, aggregateId: true },
              });
        return rows.map((row: InventoryStock): StockSnapshot => ({
          skuId: row.skuId,
          totalQuantity: row.totalQuantity,
          reservedQuantity: row.reservedQuantity,
          pendingRestockEventIds: pending
            .filter(
              (event: PendingRestockRow): boolean =>
                event.aggregateId === row.skuId,
            )
            .map((event: PendingRestockRow): string => event.id),
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

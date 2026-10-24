import { Injectable } from '@nestjs/common';
import { FindLedgerInput } from '../../../application/ports/find-ledger.input';
import { StockCounters } from '../../../application/ports/stock-counters.type';
import { StockReadPort } from '../../../application/ports/stock-read.port';
import { StockLedgerEntryReadModel } from '../../../application/read-models/stock-ledger-entry.read-model';
import { InventoryStock, StockLedger } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Prisma implementation of {@link StockReadPort}: reads rows straight into read models.
 */
@Injectable()
export class StockReadPrismaRepository implements StockReadPort {
  /**
   * @param prisma - Client for `inventory_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param skuId - SKU UUID.
   * @returns The stored counters, or `undefined` for an unknown SKU.
   */
  public async findCounters(skuId: string): Promise<StockCounters | undefined> {
    const row: InventoryStock | null =
      await this.prisma.client.inventoryStock.findUnique({
        where: { skuId },
      });
    if (row === null) {
      return undefined;
    }
    return {
      skuId: row.skuId,
      totalQuantity: row.totalQuantity,
      reservedQuantity: row.reservedQuantity,
    };
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
      createdAt: row.createdAt.getTime(),
    }));
  }
}

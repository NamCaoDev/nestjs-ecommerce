import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { StockReadPort } from '../../ports/stock-read.port';
import { STOCK_READ_PORT } from '../../ports/stock-read.token';
import { StockLedgerEntryReadModel } from '../../read-models/stock-ledger-entry.read-model';
import { GetStockLedgerQuery } from './get-stock-ledger.query';

/** Number of most recent entries returned. */
const LEDGER_PAGE_SIZE = 50;

/**
 * Reads the 50 most recent ledger entries of a SKU, newest first.
 */
@QueryHandler(GetStockLedgerQuery)
export class GetStockLedgerHandler implements IQueryHandler<
  GetStockLedgerQuery,
  StockLedgerEntryReadModel[]
> {
  /**
   * @param stockRead - PostgreSQL stock tables.
   */
  public constructor(
    @Inject(STOCK_READ_PORT) private readonly stockRead: StockReadPort,
  ) {}

  /**
   * @param query - SKU identifier.
   * @returns The latest entries; empty for an unknown SKU.
   */
  public execute(
    query: GetStockLedgerQuery,
  ): Promise<StockLedgerEntryReadModel[]> {
    return this.stockRead.findLedger({
      skuId: query.skuId,
      limit: LEDGER_PAGE_SIZE,
    });
  }
}

import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetStockBySkuQuery } from '../../application/queries/get-stock-by-sku/get-stock-by-sku.query';
import { GetStockLedgerQuery } from '../../application/queries/get-stock-ledger/get-stock-ledger.query';
import type { StockLedgerEntryReadModel } from '../../application/read-models/stock-ledger-entry.read-model';
import type { StockLevelReadModel } from '../../application/read-models/stock-level.read-model';
import type { SmokeTestResponse } from './smoke-test.response';

/** Name reported by the smoke-test endpoint. */
const SERVICE_NAME = 'inventory-service';

/**
 * REST read endpoints of the inventory (query side).
 */
@Controller('inventory')
export class InventoryHttpController {
  /**
   * @param queryBus - CQRS query bus.
   */
  public constructor(private readonly queryBus: QueryBus) {}

  /**
   * @param skuId - SKU UUID.
   * @returns Total, reserved and available stock (HTTP 404 for an unknown SKU, 400 when not a UUID).
   */
  @Get('stocks/:skuId')
  public async getStock(
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<StockLevelReadModel> {
    const stock: StockLevelReadModel | undefined = await this.queryBus.execute(
      new GetStockBySkuQuery({ skuId }),
    );
    if (stock === undefined) {
      throw new NotFoundException(`SKU ${skuId} is not stocked.`);
    }
    return stock;
  }

  /**
   * @param skuId - SKU UUID.
   * @returns The 50 most recent ledger entries, newest first.
   */
  @Get('stocks/:skuId/ledger')
  public getLedger(
    @Param('skuId', ParseUUIDPipe) skuId: string,
  ): Promise<StockLedgerEntryReadModel[]> {
    return this.queryBus.execute(new GetStockLedgerQuery({ skuId }));
  }

  /**
   * Smoke test of the inventory controller (CLAUDE.md §3: `admin/test`).
   *
   * @returns Liveness information.
   */
  @Get('admin/test')
  public getSmokeTest(): SmokeTestResponse {
    return { status: 'ok', service: SERVICE_NAME, timestamp: Date.now() };
  }
}

import { Query } from '@nestjs/cqrs';
import { StockLedgerEntryReadModel } from '../../read-models/stock-ledger-entry.read-model';

/**
 * Query reading the latest ledger entries of one SKU. Handled by {@link GetStockLedgerHandler}.
 */
export class GetStockLedgerQuery extends Query<StockLedgerEntryReadModel[]> {
  /** SKU UUID. */
  public readonly skuId: string;

  /**
   * @param props - SKU identifier.
   */
  public constructor({ skuId }: { readonly skuId: string }) {
    super();
    this.skuId = skuId;
  }
}

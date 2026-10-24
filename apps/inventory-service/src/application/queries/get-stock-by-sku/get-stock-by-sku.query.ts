import { Query } from '@nestjs/cqrs';
import { StockLevelReadModel } from '../../read-models/stock-level.read-model';

/**
 * Query reading the stock of one SKU. Handled by {@link GetStockBySkuHandler}.
 */
export class GetStockBySkuQuery extends Query<StockLevelReadModel | undefined> {
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

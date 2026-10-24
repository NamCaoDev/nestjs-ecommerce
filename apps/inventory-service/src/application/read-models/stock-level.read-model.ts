/**
 * Read model of one SKU's stock.
 */
export interface StockLevelReadModel {
  readonly skuId: string;
  readonly totalQuantity: number;
  readonly reservedQuantity: number;
  /** `totalQuantity - reservedQuantity`. */
  readonly availableQuantity: number;
  /** Where the counters came from: the Redis hot path, or PostgreSQL when Redis had no entry. */
  readonly source: 'REDIS' | 'DATABASE';
}

/**
 * Input of {@link StockCachePort.applyRestock}.
 */
export interface ApplyRestockInput {
  /** Outbox event id; the receipt is applied once per id. */
  readonly eventId: string;
  readonly skuId: string;
  /** Units to add to the cached total. */
  readonly quantity: number;
}

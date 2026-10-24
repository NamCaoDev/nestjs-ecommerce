/**
 * Payload of a `stock.restocked` outbox event.
 */
export interface StockRestockedPayload {
  readonly skuId: string;
  /** Units received, added to the cached total exactly once. */
  readonly additionalQuantity: number;
}

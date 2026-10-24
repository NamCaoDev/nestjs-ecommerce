/**
 * Integration event payload published when the stock of a placed order cannot be shipped,
 * e.g. its reservation expired and the stock was sold in the meantime.
 */
export interface StockReservationFailedPayload {
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** SKUs and quantities that could not be committed. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
  /** Machine-readable reason, e.g. `EXPIRED_OUT_OF_STOCK`. */
  readonly reason: string;
}

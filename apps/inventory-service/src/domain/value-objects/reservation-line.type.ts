/**
 * One SKU and the quantity reserved or released for it.
 */
export interface ReservationLine {
  /** Logical SKU identifier (UUID). */
  readonly skuId: string;
  /** Positive number of units. */
  readonly quantity: number;
}

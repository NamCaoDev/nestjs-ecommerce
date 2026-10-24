/**
 * Attributes of a {@link RestockRequest}.
 */
export interface RestockRequestProps {
  /** Logical SKU identifier (UUID). */
  readonly skuId: string;
  /** Units received; a positive integer. */
  readonly quantity: number;
  /** Optional reference, e.g. a purchase order number. */
  readonly referenceNote?: string;
}

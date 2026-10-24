import { DomainError } from '@org/shared-domain';

/**
 * Raised when the same SKU appears on several lines of one order.
 */
export class DuplicateOrderItemError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.DUPLICATE_ITEM';

  /**
   * @param skuId - Duplicated SKU identifier.
   */
  public constructor(skuId: string) {
    super(`SKU ${skuId} appears more than once; merge the quantities instead.`);
  }
}

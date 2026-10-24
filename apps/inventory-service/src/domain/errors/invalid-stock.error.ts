import { DomainError } from '@org/shared-domain';

/**
 * Raised when a stock level violates its invariants.
 */
export class InvalidStockError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'INVENTORY.INVALID_STOCK';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid stock: ${reason}`);
  }
}

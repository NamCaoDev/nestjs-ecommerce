import { DomainError } from '@org/shared-domain';

/**
 * Raised when at least one SKU of a reservation does not have enough available stock.
 */
export class InsufficientStockError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'INVENTORY.INSUFFICIENT_STOCK';

  /**
   * Creates the error.
   */
  public constructor() {
    super('Not enough available stock for every item of the reservation.');
  }
}

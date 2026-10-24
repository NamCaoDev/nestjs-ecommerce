import { DomainError } from '@org/shared-domain';

/**
 * Raised when the inventory service refuses to reserve stock for an order.
 */
export class StockReservationFailedError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'INVENTORY.RESERVATION_FAILED';

  /**
   * Creates the error.
   */
  public constructor() {
    super('Stock could not be reserved for every item of the order.');
  }
}

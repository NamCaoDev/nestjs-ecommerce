import { DomainError } from '@org/shared-domain';

/**
 * Raised when an order referenced by a command does not exist.
 */
export class OrderNotFoundError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.NOT_FOUND';

  /**
   * @param orderId - Missing order identifier.
   */
  public constructor(orderId: string) {
    super(`Order ${orderId} does not exist.`);
  }
}

import { DomainError } from '@org/shared-domain';

/**
 * Raised when an order line violates its invariants.
 */
export class InvalidOrderItemError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_ITEM';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid order item: ${reason}`);
  }
}

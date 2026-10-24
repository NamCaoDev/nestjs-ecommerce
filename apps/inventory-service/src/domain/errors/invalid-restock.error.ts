import { DomainError } from '@org/shared-domain';

/**
 * Raised when a restock request is malformed.
 */
export class InvalidRestockError extends DomainError {
  /** Stable error code for transport mapping (HTTP 400). */
  public readonly code: string = 'INVENTORY.INVALID_RESTOCK';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid restock: ${reason}`);
  }
}

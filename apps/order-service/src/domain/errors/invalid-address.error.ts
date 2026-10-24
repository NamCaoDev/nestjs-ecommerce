import { DomainError } from '@org/shared-domain';

/**
 * Raised when a shipping address snapshot is incomplete or malformed.
 */
export class InvalidAddressError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_ADDRESS';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid shipping address: ${reason}`);
  }
}

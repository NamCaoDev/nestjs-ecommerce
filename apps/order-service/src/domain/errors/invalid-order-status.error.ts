import { DomainError } from '@org/shared-domain';

/**
 * Raised when a value does not match any known order status.
 */
export class InvalidOrderStatusError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_STATUS';

  /**
   * @param value - Unrecognised status value.
   */
  public constructor(value: string) {
    super(`Unknown order status: ${value}`);
  }
}

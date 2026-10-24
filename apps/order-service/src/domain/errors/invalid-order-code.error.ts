import { DomainError } from '@org/shared-domain';

/**
 * Raised when an order code does not follow the `ORD-XXXXXXXXXXXX` format.
 */
export class InvalidOrderCodeError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_CODE';

  /**
   * @param value - Rejected order code.
   */
  public constructor(value: string) {
    super(`Invalid order code: ${value}`);
  }
}

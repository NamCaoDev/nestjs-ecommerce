import { DomainError } from '@org/shared-domain';

/**
 * Raised when an identifier is not a well-formed UUID.
 */
export class InvalidIdentifierError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.INVALID_IDENTIFIER';

  /**
   * @param field - Name of the invalid identifier, e.g. `orderId`.
   */
  public constructor(field: string) {
    super(`${field} must be a UUID.`);
  }
}

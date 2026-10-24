import { DomainError } from '@org/shared-domain';

/**
 * Raised when a logical identifier is not a valid UUID.
 */
export class InvalidIdentifierError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_IDENTIFIER';

  /**
   * @param fieldName - Name of the invalid identifier field.
   */
  public constructor(fieldName: string) {
    super(`${fieldName} must be a valid UUID.`);
  }
}

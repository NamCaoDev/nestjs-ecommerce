import { DomainError } from '@org/shared-domain';

/**
 * Raised when amounts in different currencies are combined.
 */
export class CurrencyMismatchError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.CURRENCY_MISMATCH';

  /**
   * Creates the error.
   */
  public constructor() {
    super('All amounts of an order must share the same currency.');
  }
}

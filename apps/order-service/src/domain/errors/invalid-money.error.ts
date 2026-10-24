import { DomainError } from '@org/shared-domain';

/**
 * Raised when an amount or currency violates the Money rules.
 */
export class InvalidMoneyError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_MONEY';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid money: ${reason}`);
  }
}

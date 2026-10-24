import { DomainError } from '@org/shared-domain';

/**
 * Raised when an order is cancelled without a reason.
 */
export class InvalidCancellationReasonError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_CANCELLATION_REASON';

  /**
   * Creates the error.
   */
  public constructor() {
    super('A cancellation reason is required.');
  }
}

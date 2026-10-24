import { DomainError } from '@org/shared-domain';

/**
 * Raised when an order is created without any item.
 */
export class EmptyOrderError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.EMPTY';

  /**
   * Creates the error.
   */
  public constructor() {
    super('An order must contain at least one item.');
  }
}

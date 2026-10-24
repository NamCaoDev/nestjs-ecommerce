import { DomainError } from '@org/shared-domain';

/**
 * Raised when a reservation or release request is malformed.
 */
export class InvalidReservationError extends DomainError {
  /** Stable error code for transport mapping (gRPC INVALID_ARGUMENT). */
  public readonly code: string = 'INVENTORY.INVALID_RESERVATION';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid reservation: ${reason}`);
  }
}

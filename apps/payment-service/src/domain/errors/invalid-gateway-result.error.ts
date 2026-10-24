import { DomainError } from '@org/shared-domain';

/**
 * Raised when a gateway result lacks the data required to record it.
 */
export class InvalidGatewayResultError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.INVALID_GATEWAY_RESULT';

  /**
   * @param field - Missing or blank field, e.g. `gatewayTxId`.
   */
  public constructor(field: string) {
    super(`Gateway result is missing ${field}.`);
  }
}

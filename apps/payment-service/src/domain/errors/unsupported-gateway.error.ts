import { DomainError } from '@org/shared-domain';

/**
 * Raised when no adapter is available for a payment gateway.
 */
export class UnsupportedGatewayError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.UNSUPPORTED_GATEWAY';

  /**
   * @param gateway - Requested gateway.
   */
  public constructor(gateway: string) {
    super(`Payment gateway ${gateway} is not supported.`);
  }
}

import { DomainError } from '@org/shared-domain';

/**
 * Raised when the gateway refuses a refund.
 */
export class GatewayRefundFailedError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.GATEWAY_REFUND_FAILED';

  /**
   * @param reason - Reason reported by the gateway.
   */
  public constructor(reason: string) {
    super(`The gateway refused the refund: ${reason}`);
  }
}

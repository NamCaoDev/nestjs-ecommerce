import { DomainError } from '@org/shared-domain';

/**
 * Raised when a webhook signature does not match its body: the request did not come from the gateway
 * or was altered in transit.
 */
export class InvalidWebhookSignatureError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.INVALID_WEBHOOK_SIGNATURE';

  /**
   * Creates the error; the message never echoes the received signature.
   */
  public constructor() {
    super('Webhook signature is missing or does not match the payload.');
  }
}

import { DomainError } from '@org/shared-domain';

/**
 * Raised when a gateway notification cannot be decoded.
 */
export class MalformedWebhookError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.MALFORMED_WEBHOOK';

  /**
   * Creates the error; the message never echoes the payload.
   */
  public constructor() {
    super('Webhook payload is malformed.');
  }
}

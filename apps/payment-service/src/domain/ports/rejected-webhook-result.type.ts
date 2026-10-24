import { GatewayPayload } from '../types/gateway-payload.type';
import { WebhookRejectionReason } from './webhook-rejection-reason.type';

/**
 * Result of a notification that failed verification. Nothing in it may be trusted.
 */
export interface RejectedWebhookResult {
  readonly isVerified: false;
  readonly reason: WebhookRejectionReason;
  /** Merchant reference claimed by the (unverified) payload, used only to attach the audit row. */
  readonly claimedTransactionId?: string;
  /** Parsed payload, when it could be parsed. */
  readonly rawResponse?: GatewayPayload;
}

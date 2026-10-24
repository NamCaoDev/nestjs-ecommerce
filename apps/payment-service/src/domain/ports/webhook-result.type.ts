import { RejectedWebhookResult } from './rejected-webhook-result.type';
import { VerifiedWebhookResult } from './verified-webhook-result.type';

/**
 * Outcome of {@link PaymentGatewayPort.verifyWebhook} and {@link PaymentGatewayPort.queryStatus}.
 */
export type WebhookResult = VerifiedWebhookResult | RejectedWebhookResult;

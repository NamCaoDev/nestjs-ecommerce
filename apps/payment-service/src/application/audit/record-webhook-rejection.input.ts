import { PaymentGatewayProvider } from '../../domain/types/payment-gateway-provider.type';
import { RejectedWebhookResult } from '../../domain/ports/rejected-webhook-result.type';

/**
 * Input of {@link PaymentAuditService.recordWebhookRejection}.
 */
export interface RecordWebhookRejectionInput {
  readonly gateway: PaymentGatewayProvider;
  readonly rejection: RejectedWebhookResult;
  readonly ipAddress?: string;
  /** Non-sensitive request metadata, e.g. user agent and content type. */
  readonly requestMetadata?: Readonly<Record<string, unknown>>;
}

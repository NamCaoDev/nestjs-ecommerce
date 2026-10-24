import { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';

/**
 * Data of a {@link ProcessWebhookCommand}.
 */
export interface ProcessWebhookCommandProps {
  /** Gateway the notification claims to come from (from the route). */
  readonly gateway: PaymentGatewayProvider;
  /** Request headers, lower-cased names. */
  readonly headers: Record<string, string>;
  /** Raw request body exactly as received; signatures are computed over it. */
  readonly rawBody: string;
  /** Caller IP, for the audit log. */
  readonly ipAddress?: string;
}

/**
 * Webhook request a gateway would send: signed headers and raw body.
 */
export interface SignedWebhook {
  readonly headers: Record<string, string>;
  readonly rawBody: string;
  /** Transaction id assigned by the gateway. */
  readonly gatewayTxId: string;
}

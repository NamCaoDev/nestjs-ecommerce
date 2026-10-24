/**
 * Response body of `POST /payments/webhook`: tells the gateway to stop retrying.
 */
export interface WebhookAckResponse {
  readonly received: true;
}

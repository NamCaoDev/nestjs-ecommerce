import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';
import { InitiatePaymentParams } from './initiate-payment-params.type';
import { PaymentClientAction } from './payment-client-action.type';
import { RefundGatewayParams } from './refund-gateway-params.type';
import { RefundGatewayResult } from './refund-gateway-result.type';
import { WebhookResult } from './webhook-result.type';

/**
 * Port to one payment gateway (strategy). Each provider has an adapter in the infrastructure layer,
 * looked up by {@link PaymentGatewayProvider} through the gateway registry.
 */
export interface PaymentGatewayPort {
  /** Provider served by the adapter. */
  readonly gatewayName: PaymentGatewayProvider;

  /**
   * Opens a payment at the gateway.
   *
   * @param params - Payment, charge reference, amount and channel.
   * @returns What the customer must do to pay.
   */
  initiate(params: InitiatePaymentParams): Promise<PaymentClientAction>;

  /**
   * Authenticates a gateway notification and decodes its result. Never throws for a bad notification.
   *
   * @param headers - Request headers, lower-cased names.
   * @param rawBody - Raw request body exactly as received.
   * @returns The verified result, or why it was rejected.
   */
  verifyWebhook(
    headers: Record<string, string>,
    rawBody: unknown,
  ): Promise<WebhookResult>;

  /**
   * Refunds (part of) a successful charge.
   *
   * @param params - Charge, amount and refund reference.
   * @returns The gateway answer.
   */
  refund(params: RefundGatewayParams): Promise<RefundGatewayResult>;

  /**
   * Asks the gateway for the status of a charge (reconciliation of missed webhooks).
   *
   * @param gatewayTxId - Gateway id or merchant reference of the charge.
   * @param orderId - Order of the charge.
   * @returns The current result.
   */
  queryStatus(gatewayTxId: string, orderId: string): Promise<WebhookResult>;
}

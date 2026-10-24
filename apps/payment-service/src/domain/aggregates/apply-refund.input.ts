import { GatewayPayload } from '../types/gateway-payload.type';
import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';
import { Money } from '../value-objects/money.vo';

/**
 * Input of {@link Payment.applyRefund}: a refund the gateway has confirmed.
 */
export interface ApplyRefundInput {
  /** UUID of the refund entry. */
  readonly transactionId: string;
  /** Positive amount, in the payment currency. */
  readonly amount: Money;
  /** Refund id at the gateway. */
  readonly gatewayTxId: string;
  readonly gateway: PaymentGatewayProvider;
  readonly channel: PaymentChannel;
  /** Key of the refund request; a replay creates nothing. */
  readonly idempotencyKey: string;
  readonly rawResponse?: GatewayPayload;
}

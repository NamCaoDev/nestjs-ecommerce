import { GatewayPayload } from '../types/gateway-payload.type';
import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';

/**
 * Input of {@link Payment.initiateCharge}.
 */
export interface InitiateChargeInput {
  /** UUID of the charge; the merchant reference sent to the gateway. */
  readonly transactionId: string;
  readonly gateway: PaymentGatewayProvider;
  readonly channel: PaymentChannel;
  /** Key of the request that opens the charge. */
  readonly idempotencyKey: string;
  /** Gateway answer to the initiation (redirect, QR code, virtual account). */
  readonly rawGatewayResponse?: GatewayPayload;
}

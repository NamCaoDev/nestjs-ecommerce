import { GatewayPayload } from '../types/gateway-payload.type';
import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';
import { Money } from '../value-objects/money.vo';

/**
 * Data shared by every new ledger entry.
 */
export interface CreateTransactionInput {
  /** UUID assigned by the application layer. */
  readonly id: string;
  readonly gateway: PaymentGatewayProvider;
  readonly channel: PaymentChannel;
  /** Positive amount. */
  readonly amount: Money;
  /** Key of the request that creates the entry. */
  readonly idempotencyKey: string;
  /** Gateway payload at creation (checkout action, refund response). */
  readonly rawGatewayResponse?: GatewayPayload;
}

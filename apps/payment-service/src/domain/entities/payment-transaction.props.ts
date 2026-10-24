import { GatewayPayload } from '../types/gateway-payload.type';
import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';
import { TransactionStatus } from '../types/transaction-status.type';
import { TransactionType } from '../types/transaction-type.type';
import { Money } from '../value-objects/money.vo';

/**
 * Complete state of a {@link PaymentTransaction}, used by {@link PaymentTransaction.restore}.
 */
export interface PaymentTransactionProps {
  /** UUID assigned by the application layer; also the merchant reference sent to the gateway. */
  readonly id: string;
  readonly type: TransactionType;
  readonly gateway: PaymentGatewayProvider;
  readonly channel: PaymentChannel;
  readonly amount: Money;
  readonly status: TransactionStatus;
  /** Reconciliation id at the gateway; known once the gateway answered. */
  readonly gatewayTxId?: string;
  readonly failureReason?: string;
  /** Key of the request that created the entry. */
  readonly idempotencyKey: string;
  /** Original gateway payload kept for audits. */
  readonly rawGatewayResponse?: GatewayPayload;
  /** Epoch milliseconds. */
  readonly createdAt?: number;
}

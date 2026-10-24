import { PaymentChannel } from '../../domain/types/payment-channel.type';
import { PaymentGatewayProvider } from '../../domain/types/payment-gateway-provider.type';
import { TransactionStatus } from '../../domain/types/transaction-status.type';
import { TransactionType } from '../../domain/types/transaction-type.type';

/**
 * Ledger entry as returned by the read side.
 */
export interface PaymentTransactionReadModel {
  readonly transactionId: string;
  readonly type: TransactionType;
  readonly gateway: PaymentGatewayProvider;
  readonly channel: PaymentChannel;
  readonly status: TransactionStatus;
  /** Amount in major currency units. */
  readonly amount: number;
  readonly gatewayTxId: string | null;
  readonly failureReason: string | null;
  /** Epoch milliseconds. */
  readonly createdAt: number;
}

import { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';

/**
 * Webhook delivered by the mock gateway.
 */
export interface SimulateGatewayPaymentOutput {
  readonly orderId: string;
  /** Charge UUID (merchant reference). */
  readonly transactionId: string;
  /** Transaction id assigned by the mock gateway. */
  readonly gatewayTxId: string;
  readonly status: FinalTransactionStatus;
}

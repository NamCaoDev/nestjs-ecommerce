import { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';

/**
 * Body of a MOCK gateway webhook.
 */
export interface MockWebhookBody {
  /** Merchant reference: the charge UUID. */
  readonly transactionId: string;
  readonly orderId: string;
  readonly gatewayTxId: string;
  readonly status: FinalTransactionStatus;
  /** Captured amount in major currency units. */
  readonly amount: number;
  readonly failureReason?: string;
}

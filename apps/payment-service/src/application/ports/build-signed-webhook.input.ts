import { FinalTransactionStatus } from '../../domain/types/final-transaction-status.type';

/**
 * Input of {@link MockGatewaySimulatorPort.buildSignedWebhook}.
 */
export interface BuildSignedWebhookInput {
  /** Charge UUID (merchant reference). */
  readonly transactionId: string;
  readonly orderId: string;
  /** Captured amount in major currency units. */
  readonly amount: number;
  readonly status: FinalTransactionStatus;
  readonly failureReason?: string;
}

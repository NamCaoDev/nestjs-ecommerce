import { FinalTransactionStatus } from '../types/final-transaction-status.type';
import { GatewayPayload } from '../types/gateway-payload.type';

/**
 * Input of {@link PaymentTransaction.finalize}.
 */
export interface FinalizeTransactionInput {
  readonly status: FinalTransactionStatus;
  /** Reconciliation id reported by the gateway. */
  readonly gatewayTxId: string;
  /** Gateway payload that carried the result. */
  readonly rawResponse?: GatewayPayload;
  /** Reason of a FAILED or CANCELLED result. */
  readonly failureReason?: string;
}

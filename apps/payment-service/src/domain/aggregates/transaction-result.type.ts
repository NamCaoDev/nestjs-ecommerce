import { FinalTransactionStatus } from '../types/final-transaction-status.type';
import { GatewayPayload } from '../types/gateway-payload.type';

/**
 * Final result of a charge, as verified from the gateway.
 */
export interface TransactionResult {
  readonly status: FinalTransactionStatus;
  readonly gatewayTxId: string;
  /** Amount the gateway reports as captured; checked against the charge when present. */
  readonly amount?: number;
  readonly failureReason?: string;
  readonly rawResponse?: GatewayPayload;
}

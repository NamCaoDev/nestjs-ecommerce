import { GatewayPayload } from '../types/gateway-payload.type';
import { TransactionStatus } from '../types/transaction-status.type';

/**
 * Result of an authentic gateway notification or status query.
 */
export interface VerifiedWebhookResult {
  readonly isVerified: true;
  /** Merchant reference echoed by the gateway: the charge UUID. */
  readonly transactionId: string;
  readonly gatewayTxId: string;
  /** PENDING only for status queries of an unfinished payment. */
  readonly status: TransactionStatus;
  /** Amount the gateway reports, in major currency units. */
  readonly amount?: number;
  readonly failureReason?: string;
  /** Payload as received, for the ledger and audits. */
  readonly rawResponse: GatewayPayload;
}

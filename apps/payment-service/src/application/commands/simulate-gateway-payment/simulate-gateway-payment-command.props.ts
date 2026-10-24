import { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';

/**
 * Data of a {@link SimulateGatewayPaymentCommand}.
 */
export interface SimulateGatewayPaymentCommandProps {
  /** Order whose payment the customer completes. */
  readonly orderId: string;
  /** Result the mock gateway reports. */
  readonly status: FinalTransactionStatus;
  /** Reason of a FAILED or CANCELLED result. */
  readonly failureReason?: string;
  /** Caller IP, recorded with the webhook. */
  readonly ipAddress?: string;
}

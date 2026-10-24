import { GatewayPayload } from '../types/gateway-payload.type';

/**
 * Answer of a gateway to a refund request.
 */
export interface RefundGatewayResult {
  readonly status: 'SUCCESS' | 'FAILED';
  /** Refund id at the gateway. */
  readonly gatewayTxId: string;
  readonly failureReason?: string;
  readonly rawResponse: GatewayPayload;
}

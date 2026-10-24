import { ApiProperty } from '@nestjs/swagger';
import { SimulateGatewayPaymentOutput } from '../../../application/commands/simulate-gateway-payment/simulate-gateway-payment.output';
import type { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';

/**
 * OpenAPI schema of {@link SimulateGatewayPaymentOutput}.
 */
export class SimulatedWebhookDoc implements SimulateGatewayPaymentOutput {
  @ApiProperty({ format: 'uuid' })
  public readonly orderId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly transactionId!: string;

  @ApiProperty({ example: 'mock_tx_7c2f0c4e-4f5e-4b8e-9d1a-2f6b3c9d8e7a' })
  public readonly gatewayTxId!: string;

  @ApiProperty({ enum: ['SUCCESS', 'FAILED', 'CANCELLED'] })
  public readonly status!: FinalTransactionStatus;
}

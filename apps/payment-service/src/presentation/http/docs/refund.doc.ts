import { ApiProperty } from '@nestjs/swagger';
import { RefundPaymentOutput } from '../../../application/commands/refund-payment/refund-payment.output';
import type { PaymentStatus } from '../../../domain/types/payment-status.type';

/**
 * OpenAPI schema of {@link RefundPaymentOutput}.
 */
export class RefundDoc implements RefundPaymentOutput {
  @ApiProperty({ format: 'uuid' })
  public readonly paymentId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly refundTransactionId!: string;

  @ApiProperty({ enum: ['PARTIALLY_REFUNDED', 'REFUNDED'] })
  public readonly status!: PaymentStatus;

  @ApiProperty({ example: 10 })
  public readonly totalAmount!: number;

  @ApiProperty({ example: 4.5 })
  public readonly refundedAmount!: number;

  @ApiProperty({ example: 'USD' })
  public readonly currency!: string;
}

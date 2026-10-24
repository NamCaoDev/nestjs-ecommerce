import { ApiProperty } from '@nestjs/swagger';
import { PaymentReadModel } from '../../../application/read-models/payment.read-model';
import type { PaymentStatus } from '../../../domain/types/payment-status.type';
import { PaymentTransactionDoc } from './payment-transaction.doc';

/**
 * OpenAPI schema of {@link PaymentReadModel}.
 */
export class PaymentDoc implements PaymentReadModel {
  @ApiProperty({ format: 'uuid' })
  public readonly paymentId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly orderId!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly customerId!: string;

  @ApiProperty({
    enum: ['PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED'],
  })
  public readonly status!: PaymentStatus;

  @ApiProperty({ example: 10, description: 'Never changes, refunds included.' })
  public readonly totalAmount!: number;

  @ApiProperty({ example: 0 })
  public readonly refundedAmount!: number;

  @ApiProperty({ example: 'USD' })
  public readonly currency!: string;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'While a charge is pending: { type: REDIRECT, url } | { type: QR_CODE, qrContent, qrImageUrl } | { type: VIRTUAL_ACCOUNT, bankBin, accountNumber, accountName, expiresAt }.',
  })
  public readonly clientAction!: Readonly<Record<string, unknown>> | null;

  @ApiProperty({ type: [PaymentTransactionDoc] })
  public readonly transactions!: PaymentTransactionDoc[];

  @ApiProperty({ example: 1 })
  public readonly version!: number;

  @ApiProperty({ description: 'Epoch milliseconds.' })
  public readonly createdAt!: number;

  @ApiProperty({ description: 'Epoch milliseconds.' })
  public readonly updatedAt!: number;
}

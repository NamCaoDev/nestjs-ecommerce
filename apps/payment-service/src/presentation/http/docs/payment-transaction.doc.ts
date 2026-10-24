import { ApiProperty } from '@nestjs/swagger';
import { PaymentTransactionReadModel } from '../../../application/read-models/payment-transaction.read-model';
import type { PaymentChannel } from '../../../domain/types/payment-channel.type';
import type { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';
import type { TransactionStatus } from '../../../domain/types/transaction-status.type';
import type { TransactionType } from '../../../domain/types/transaction-type.type';

/**
 * OpenAPI schema of {@link PaymentTransactionReadModel}.
 */
export class PaymentTransactionDoc implements PaymentTransactionReadModel {
  @ApiProperty({ format: 'uuid' })
  public readonly transactionId!: string;

  @ApiProperty({ enum: ['CHARGE', 'REFUND'] })
  public readonly type!: TransactionType;

  @ApiProperty({
    enum: ['VNPAY', 'VIETQR_VA', 'MOMO', 'ZALOPAY', 'STRIPE', 'MOCK'],
  })
  public readonly gateway!: PaymentGatewayProvider;

  @ApiProperty({
    enum: ['QR_CODE', 'DOMESTIC_BANK', 'INTERNATIONAL_CARD', 'BANK_TRANSFER'],
  })
  public readonly channel!: PaymentChannel;

  @ApiProperty({ enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'] })
  public readonly status!: TransactionStatus;

  @ApiProperty({ example: 10 })
  public readonly amount!: number;

  @ApiProperty({ type: String, nullable: true })
  public readonly gatewayTxId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public readonly failureReason!: string | null;

  @ApiProperty({ description: 'Epoch milliseconds.' })
  public readonly createdAt!: number;
}

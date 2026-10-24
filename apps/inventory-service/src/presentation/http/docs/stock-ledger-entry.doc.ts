import { ApiProperty } from '@nestjs/swagger';
import { StockLedgerEntryReadModel } from '../../../application/read-models/stock-ledger-entry.read-model';

/**
 * OpenAPI schema of {@link StockLedgerEntryReadModel}.
 */
export class StockLedgerEntryDoc implements StockLedgerEntryReadModel {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly skuId!: string;

  @ApiProperty({
    enum: ['RESERVED', 'RELEASED', 'COMMITTED', 'EXPIRED_RELEASE'],
    example: 'COMMITTED',
  })
  public readonly actionType!: string;

  @ApiProperty({
    description: 'Positive when reserving, negative otherwise.',
    example: -2,
  })
  public readonly quantityChanged!: number;

  @ApiProperty({ format: 'uuid' })
  public readonly orderId!: string;

  @ApiProperty({ example: '0199a7c0-0000-7000-8000-0000000000c1:checkout-42' })
  public readonly reservationKey!: string;

  @ApiProperty({ description: 'Epoch milliseconds.', example: 1792843950926 })
  public readonly createdAt!: number;
}

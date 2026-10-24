import { ApiProperty } from '@nestjs/swagger';
import { StockLevelReadModel } from '../../../application/read-models/stock-level.read-model';

/**
 * OpenAPI schema of {@link StockLevelReadModel}.
 */
export class StockLevelDoc implements StockLevelReadModel {
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-000000000101',
  })
  public readonly skuId!: string;

  @ApiProperty({ example: 100 })
  public readonly totalQuantity!: number;

  @ApiProperty({ example: 4 })
  public readonly reservedQuantity!: number;

  @ApiProperty({ description: 'totalQuantity - reservedQuantity', example: 96 })
  public readonly availableQuantity!: number;

  @ApiProperty({
    enum: ['REDIS', 'DATABASE'],
    description:
      'DATABASE when Redis had no entry and was restored from PostgreSQL.',
    example: 'REDIS',
  })
  public readonly source!: 'REDIS' | 'DATABASE';
}

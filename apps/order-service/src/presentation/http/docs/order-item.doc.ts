import { ApiProperty } from '@nestjs/swagger';
import { OrderItemReadModel } from '../../../application/read-models/order-item.read-model';

/**
 * OpenAPI schema of {@link OrderItemReadModel}.
 */
export class OrderItemDoc implements OrderItemReadModel {
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-000000000101',
  })
  public readonly skuId!: string;

  @ApiProperty({ example: 'Mug' })
  public readonly productName!: string;

  @ApiProperty({ example: 2 })
  public readonly quantity!: number;

  @ApiProperty({ example: 19.99 })
  public readonly unitPrice!: number;

  @ApiProperty({ example: 39.98 })
  public readonly lineTotal!: number;
}

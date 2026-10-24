import { ApiProperty } from '@nestjs/swagger';
import { OrdersPageReadModel } from '../../../application/read-models/orders-page.read-model';
import { OrderDoc } from './order.doc';

/**
 * OpenAPI schema of {@link OrdersPageReadModel}.
 */
export class OrdersPageDoc implements OrdersPageReadModel {
  @ApiProperty({ type: [OrderDoc] })
  public readonly items!: OrderDoc[];

  @ApiProperty({ example: 1 })
  public readonly page!: number;

  @ApiProperty({ example: 20 })
  public readonly limit!: number;

  @ApiProperty({
    description: 'Orders of the customer across all pages.',
    example: 1,
  })
  public readonly total!: number;
}

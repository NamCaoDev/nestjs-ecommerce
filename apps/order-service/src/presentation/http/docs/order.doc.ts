import { ApiProperty } from '@nestjs/swagger';
import { OrderReadModel } from '../../../application/read-models/order.read-model';
import { ShippingAddressDto } from '../dto/shipping-address.dto';
import { OrderItemDoc } from './order-item.doc';

/**
 * OpenAPI schema of {@link OrderReadModel}. Amounts are major currency units; timestamps are epoch ms.
 */
export class OrderDoc implements OrderReadModel {
  @ApiProperty({ format: 'uuid' })
  public readonly orderId!: string;

  @ApiProperty({ example: 'ORD-2AFDBEC203EF' })
  public readonly orderCode!: string;

  @ApiProperty({ format: 'uuid' })
  public readonly customerId!: string;

  @ApiProperty({
    enum: ['PENDING', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
    example: 'PENDING',
  })
  public readonly status!: string;

  @ApiProperty({ example: 'USD' })
  public readonly currency!: string;

  @ApiProperty({ example: 39.98 })
  public readonly subtotalAmount!: number;

  @ApiProperty({ example: 0 })
  public readonly shippingAmount!: number;

  @ApiProperty({ example: 0 })
  public readonly discountAmount!: number;

  @ApiProperty({ example: 39.98 })
  public readonly totalAmount!: number;

  @ApiProperty({ type: ShippingAddressDto })
  public readonly shippingAddress!: Record<string, unknown>;

  @ApiProperty({ type: [OrderItemDoc] })
  public readonly items!: OrderItemDoc[];

  @ApiProperty({ description: 'Optimistic concurrency version.', example: 1 })
  public readonly version!: number;

  @ApiProperty({ description: 'Epoch milliseconds.', example: 1792843950926 })
  public readonly createdAt!: number;

  @ApiProperty({ description: 'Epoch milliseconds.', example: 1792843950926 })
  public readonly updatedAt!: number;
}

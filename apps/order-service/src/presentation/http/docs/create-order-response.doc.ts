import { ApiProperty } from '@nestjs/swagger';
import { CreateOrderResponse } from '../create-order.response';

/**
 * OpenAPI schema of {@link CreateOrderResponse}.
 */
export class CreateOrderResponseDoc implements CreateOrderResponse {
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-4000-8000-2afdbec203ef',
  })
  public readonly orderId!: string;

  @ApiProperty({ example: 'ORD-2AFDBEC203EF' })
  public readonly orderCode!: string;

  @ApiProperty({ description: 'Major currency units.', example: 39.98 })
  public readonly totalAmount!: number;

  @ApiProperty({ description: 'ISO 4217.', example: 'USD' })
  public readonly currency!: string;
}

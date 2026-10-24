import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO4217CurrencyCode,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';
import { ShippingAddressDto } from './shipping-address.dto';

/** Largest number of lines accepted in one order. */
const MAX_ORDER_LINES = 100;

/**
 * Body of `POST /orders`. Validates shape and formats only; business rules stay in the domain.
 */
export class CreateOrderDto {
  /** Logical customer identifier (UUID). */
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-0000000000c1',
  })
  @IsUUID()
  public readonly customerId!: string;

  /** ISO 4217 currency code of every unit price. */
  @ApiProperty({
    description: 'ISO 4217 code of every unit price.',
    example: 'USD',
  })
  @IsISO4217CurrencyCode()
  public readonly currency!: string;

  /** Order lines. */
  @ApiProperty({ type: [CreateOrderItemDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  public readonly items!: CreateOrderItemDto[];

  /** Shipping address snapshot. */
  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  public readonly shippingAddress!: ShippingAddressDto;
}

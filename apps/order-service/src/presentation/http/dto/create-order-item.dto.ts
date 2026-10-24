import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Longest accepted product name. */
const MAX_PRODUCT_NAME_LENGTH = 200;

/** Largest quantity accepted on one line. */
const MAX_QUANTITY_PER_LINE = 1_000;

/** Decimal places supported by `Money` and the `Decimal(19, 4)` columns. */
const MAX_PRICE_DECIMAL_PLACES = 4;

/**
 * One order line in a `POST /orders` request.
 */
export class CreateOrderItemDto {
  /** Logical SKU identifier (UUID). */
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-000000000101',
  })
  @IsUUID()
  public readonly skuId!: string;

  /** Product name captured at checkout. */
  @ApiProperty({ maxLength: 200, example: 'Mug' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRODUCT_NAME_LENGTH)
  public readonly productName!: string;

  /** Number of units. */
  @ApiProperty({ minimum: 1, maximum: 1000, example: 2 })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PER_LINE)
  public readonly quantity!: number;

  /** Unit price in major currency units. */
  @IsNumber({
    allowNaN: false,
    allowInfinity: false,
    maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES,
  })
  @ApiProperty({
    minimum: 0,
    description: 'Major currency units, up to 4 decimals.',
    example: 19.99,
  })
  @Min(0)
  public readonly unitPrice!: number;
}

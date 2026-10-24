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
  @IsUUID()
  public readonly skuId!: string;

  /** Product name captured at checkout. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRODUCT_NAME_LENGTH)
  public readonly productName!: string;

  /** Number of units. */
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
  @Min(0)
  public readonly unitPrice!: number;
}

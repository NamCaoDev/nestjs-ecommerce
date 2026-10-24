import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/** Decimal places accepted, matching `Decimal(19, 4)`. */
const MAX_DECIMAL_PLACES = 4;

/** Longest refund reason. */
const MAX_REASON_LENGTH = 500;

/**
 * Body of `POST /payments/:id/refunds`.
 */
export class RefundPaymentDto {
  @ApiProperty({ example: 4.5, description: 'Major currency units.' })
  @IsNumber({ maxDecimalPlaces: MAX_DECIMAL_PLACES })
  @IsPositive()
  public readonly amount!: number;

  @ApiProperty({ maxLength: MAX_REASON_LENGTH, example: 'Damaged item' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_REASON_LENGTH)
  public readonly reason!: string;
}

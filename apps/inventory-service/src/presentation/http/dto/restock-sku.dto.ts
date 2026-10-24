import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Largest quantity accepted in one receipt. */
const MAX_RESTOCK_QUANTITY = 1_000_000;

/** Longest accepted reference note. */
const MAX_NOTE_LENGTH = 500;

/**
 * Body of `POST /inventory/stocks/restock`.
 */
export class RestockSkuDto {
  @ApiProperty({
    format: 'uuid',
    example: '0199a7c0-0000-7000-8000-000000000101',
  })
  @IsUUID()
  public readonly skuId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_RESTOCK_QUANTITY, example: 50 })
  @IsInt()
  @Min(1)
  @Max(MAX_RESTOCK_QUANTITY)
  public readonly quantity!: number;

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, example: 'PO-2026-0042' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  public readonly note?: string;
}

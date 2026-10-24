import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Longest accepted address field. */
const MAX_FIELD_LENGTH = 255;

/**
 * Shipping address in a `POST /orders` request; stored as an immutable snapshot.
 */
export class ShippingAddressDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly recipientName!: string;

  @ApiProperty({ example: '+84900000000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly phoneNumber!: string;

  @ApiProperty({ example: '1 Le Loi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly line1!: string;

  @ApiPropertyOptional({ example: 'Floor 3' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly line2?: string;

  @ApiProperty({ example: 'Ho Chi Minh City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly city!: string;

  @ApiProperty({ example: '700000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly postalCode!: string;

  /** ISO 3166-1 alpha-2 country code, e.g. `VN`. */
  @ApiProperty({ description: 'ISO 3166-1 alpha-2.', example: 'VN' })
  @IsISO31661Alpha2()
  public readonly countryCode!: string;
}

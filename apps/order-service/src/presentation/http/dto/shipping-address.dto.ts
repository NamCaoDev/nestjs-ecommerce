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
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly recipientName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly phoneNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly line2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  public readonly postalCode!: string;

  /** ISO 3166-1 alpha-2 country code, e.g. `VN`. */
  @IsISO31661Alpha2()
  public readonly countryCode!: string;
}

import { Result, ValueObject } from '@org/shared-domain';
import { InvalidAddressError } from '../errors/invalid-address.error';
import { isBlank } from '../utils/is-blank.util';
import { AddressSnapshotProps } from './address-snapshot.props';

/** Fields that must contain visible characters. */
const REQUIRED_FIELDS: readonly (keyof AddressSnapshotProps)[] = [
  'recipientName',
  'phoneNumber',
  'line1',
  'city',
  'postalCode',
  'countryCode',
] as const;

/** ISO 3166-1 alpha-2 country code. */
const COUNTRY_CODE_PATTERN: RegExp = /^[A-Z]{2}$/;

/**
 * Immutable, point-in-time copy of the shipping address (CLAUDE.md §4.4):
 * later changes to the customer's address book never alter a placed order.
 */
export class AddressSnapshot extends ValueObject<AddressSnapshotProps> {
  private constructor(props: AddressSnapshotProps) {
    super(props);
  }

  /**
   * Creates an address snapshot.
   *
   * @param props - Address fields.
   * @returns The snapshot, or an {@link InvalidAddressError} when a field is missing or malformed.
   */
  public static create(
    props: AddressSnapshotProps,
  ): Result<AddressSnapshot, InvalidAddressError> {
    const missingField: keyof AddressSnapshotProps | undefined =
      REQUIRED_FIELDS.find((field: keyof AddressSnapshotProps): boolean =>
        isBlank(props[field] ?? ''),
      );
    if (missingField !== undefined) {
      return Result.fail(
        new InvalidAddressError(`${missingField} is required`),
      );
    }
    if (!COUNTRY_CODE_PATTERN.test(props.countryCode)) {
      return Result.fail(
        new InvalidAddressError('countryCode must be ISO 3166-1 alpha-2'),
      );
    }
    return Result.ok(new AddressSnapshot({ ...props }));
  }

  /**
   * @returns A plain copy of the address fields, e.g. for JSON persistence.
   */
  public toPrimitives(): AddressSnapshotProps {
    return { ...this.props };
  }
}

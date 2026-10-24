/**
 * Attributes of an {@link AddressSnapshot}, captured at order time.
 */
export interface AddressSnapshotProps {
  readonly recipientName: string;
  readonly phoneNumber: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  /** ISO 3166-1 alpha-2 country code, e.g. `VN`. */
  readonly countryCode: string;
}

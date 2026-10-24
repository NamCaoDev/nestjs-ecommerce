import { Result } from '@org/shared-domain';
import { InvalidAddressError } from '../errors/invalid-address.error';
import { AddressSnapshotProps } from './address-snapshot.props';
import { AddressSnapshot } from './address-snapshot.vo';

const VALID_ADDRESS: AddressSnapshotProps = {
  recipientName: 'Nguyen Van A',
  phoneNumber: '+84900000000',
  line1: '1 Le Loi',
  city: 'Ho Chi Minh City',
  postalCode: '700000',
  countryCode: 'VN',
};

describe('AddressSnapshot', () => {
  describe('create', () => {
    it('should keep every field', () => {
      // Arrange
      const inputProps: AddressSnapshotProps = { ...VALID_ADDRESS };
      // Act
      const actualResult: Result<AddressSnapshot, InvalidAddressError> =
        AddressSnapshot.create(inputProps);
      // Assert
      expect(actualResult.getValue().toPrimitives()).toEqual(VALID_ADDRESS);
    });
    it('should not freeze the caller input', () => {
      // Arrange
      const inputProps: AddressSnapshotProps = { ...VALID_ADDRESS };
      // Act
      AddressSnapshot.create(inputProps);
      // Assert
      expect(Object.isFrozen(inputProps)).toBe(false);
    });
    it('should reject a blank required field', () => {
      // Arrange
      const inputProps: AddressSnapshotProps = { ...VALID_ADDRESS, city: ' ' };
      // Act
      const actualResult: Result<AddressSnapshot, InvalidAddressError> =
        AddressSnapshot.create(inputProps);
      // Assert
      expect(actualResult.getError().message).toContain('city is required');
    });
    it('should reject a country code that is not ISO 3166-1 alpha-2', () => {
      // Arrange
      const inputProps: AddressSnapshotProps = {
        ...VALID_ADDRESS,
        countryCode: 'VNM',
      };
      // Act
      const actualResult: Result<AddressSnapshot, InvalidAddressError> =
        AddressSnapshot.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidAddressError);
    });
  });
  describe('toPrimitives', () => {
    it('should return a copy that does not affect the snapshot', () => {
      // Arrange
      const inputSnapshot: AddressSnapshot =
        AddressSnapshot.create(VALID_ADDRESS).getValue();
      const actualPrimitives: AddressSnapshotProps =
        inputSnapshot.toPrimitives();
      // Act
      Object.assign(actualPrimitives, { city: 'Ha Noi' });
      // Assert
      expect(inputSnapshot.toPrimitives().city).toBe(VALID_ADDRESS.city);
    });
  });
});

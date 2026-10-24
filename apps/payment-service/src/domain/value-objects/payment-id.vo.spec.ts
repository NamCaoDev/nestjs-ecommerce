import { DomainError, Result } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { PaymentId } from './payment-id.vo';

describe('PaymentId', () => {
  describe('create', () => {
    it('should lowercase a valid UUID', () => {
      // Arrange
      const inputValue: string = '0199A7C0-0000-7000-8000-0000000000F1';
      // Act
      const actualResult: Result<PaymentId, DomainError> =
        PaymentId.create(inputValue);
      // Assert
      expect(actualResult.getValue().value).toBe(
        '0199a7c0-0000-7000-8000-0000000000f1',
      );
    });
    it('should refuse a value that is not a UUID', () => {
      // Arrange
      const inputValue: string = 'payment-1';
      // Act
      const actualResult: Result<PaymentId, DomainError> =
        PaymentId.create(inputValue);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidIdentifierError);
    });
  });
});

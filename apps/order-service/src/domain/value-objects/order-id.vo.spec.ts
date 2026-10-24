import { Result } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { OrderId } from './order-id.vo';

describe('OrderId', () => {
  describe('create', () => {
    it('should normalise a UUID to lower case', () => {
      // Arrange
      const inputValue: string = '0199A7C0-0000-7000-8000-00000000000A';
      // Act
      const actualResult: Result<OrderId, InvalidIdentifierError> =
        OrderId.create(inputValue);
      // Assert
      expect(actualResult.getValue().value).toBe(inputValue.toLowerCase());
    });
    it('should reject a value that is not a UUID', () => {
      // Arrange
      const inputValue: string = 'order-1';
      // Act
      const actualResult: Result<OrderId, InvalidIdentifierError> =
        OrderId.create(inputValue);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidIdentifierError);
    });
  });
  describe('equals', () => {
    it('should treat the same UUID in different case as equal', () => {
      // Arrange
      const inputLower: OrderId = OrderId.create(
        '0199a7c0-0000-7000-8000-00000000000a',
      ).getValue();
      const inputUpper: OrderId = OrderId.create(
        '0199A7C0-0000-7000-8000-00000000000A',
      ).getValue();
      // Act
      const actualResult: boolean = inputLower.equals(inputUpper);
      // Assert
      expect(actualResult).toBe(true);
    });
  });
});

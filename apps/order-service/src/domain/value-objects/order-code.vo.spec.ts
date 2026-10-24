import { Result } from '@org/shared-domain';
import { InvalidOrderCodeError } from '../errors/invalid-order-code.error';
import { OrderCode } from './order-code.vo';

describe('OrderCode', () => {
  describe('create', () => {
    it('should accept the ORD- format', () => {
      // Arrange
      const inputValue: string = 'ORD-1A2B3C4D5E6F';
      // Act
      const actualResult: Result<OrderCode, InvalidOrderCodeError> =
        OrderCode.create(inputValue);
      // Assert
      expect(actualResult.getValue().value).toBe(inputValue);
    });
    it.each([
      'ord-1a2b3c4d5e6f',
      'ORD-12',
      `ORD-${'A'.repeat(29)}`,
      'X-123456',
    ])('should reject %p', (inputValue: string) => {
      // Arrange
      const expectedErrorType: typeof InvalidOrderCodeError =
        InvalidOrderCodeError;
      // Act
      const actualResult: Result<OrderCode, InvalidOrderCodeError> =
        OrderCode.create(inputValue);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
    });
  });
});

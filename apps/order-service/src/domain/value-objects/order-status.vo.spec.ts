import { Result } from '@org/shared-domain';
import { InvalidOrderStatusError } from '../errors/invalid-order-status.error';
import { OrderStatus } from './order-status.vo';

describe('OrderStatus', () => {
  describe('create', () => {
    it('should resolve a known value to its canonical instance', () => {
      // Arrange
      const inputValue: string = 'PAYMENT_FAILED';
      // Act
      const actualResult: Result<OrderStatus, InvalidOrderStatusError> =
        OrderStatus.create(inputValue);
      // Assert
      expect(actualResult.getValue()).toBe(OrderStatus.PAYMENT_FAILED);
    });
    it('should reject an unknown value', () => {
      // Arrange
      const inputValue: string = 'SHIPPED';
      // Act
      const actualResult: Result<OrderStatus, InvalidOrderStatusError> =
        OrderStatus.create(inputValue);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidOrderStatusError);
    });
  });
  describe('isPending', () => {
    it('should be true only for PENDING', () => {
      // Arrange
      const inputStatuses: OrderStatus[] = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PAYMENT_FAILED,
        OrderStatus.CANCELLED,
      ];
      // Act
      const actualResults: boolean[] = inputStatuses.map(
        (status: OrderStatus): boolean => status.isPending(),
      );
      // Assert
      expect(actualResults).toEqual([true, false, false, false]);
    });
  });
});

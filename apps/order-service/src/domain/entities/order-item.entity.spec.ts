import { DomainError, Result } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';
import { Money } from '../value-objects/money.vo';
import { OrderItemProps } from './order-item.props';
import { OrderItem } from './order-item.entity';

const SKU_ID = '0199a7c0-0000-7000-8000-0000000000a1';

/**
 * Builds valid order line input with optional overrides.
 */
const createInputProps = (
  overrides: Partial<OrderItemProps> = {},
): OrderItemProps => ({
  skuId: SKU_ID,
  productName: 'Mug',
  quantity: 3,
  unitPrice: Money.create({ amount: 19.99, currency: 'USD' }).getValue(),
  ...overrides,
});

describe('OrderItem', () => {
  describe('create', () => {
    it('should expose the SKU as identity and compute the line total', () => {
      // Arrange
      const inputProps: OrderItemProps = createInputProps();
      // Act
      const actualItem: OrderItem = OrderItem.create(inputProps).getValue();
      // Assert
      expect(actualItem.skuId).toBe(SKU_ID);
      expect(actualItem.lineTotal.amount).toBe(59.97);
    });
    it.each([0, -1, 1.5])(
      'should reject quantity %p',
      (inputQuantity: number) => {
        // Arrange
        const inputProps: OrderItemProps = createInputProps({
          quantity: inputQuantity,
        });
        // Act
        const actualResult: Result<OrderItem, DomainError> =
          OrderItem.create(inputProps);
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(InvalidOrderItemError);
      },
    );
    it('should reject a SKU that is not a UUID', () => {
      // Arrange
      const inputProps: OrderItemProps = createInputProps({ skuId: 'MUG-01' });
      // Act
      const actualResult: Result<OrderItem, DomainError> =
        OrderItem.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidIdentifierError);
    });
    it('should reject a blank product name', () => {
      // Arrange
      const inputProps: OrderItemProps = createInputProps({ productName: '' });
      // Act
      const actualResult: Result<OrderItem, DomainError> =
        OrderItem.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidOrderItemError);
    });
  });
});

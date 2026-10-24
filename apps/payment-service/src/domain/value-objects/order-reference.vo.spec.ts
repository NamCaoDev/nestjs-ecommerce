import { DomainError, Result } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { InvalidPaymentLinesError } from '../errors/invalid-payment-lines.error';
import { OrderReference } from './order-reference.vo';
import { OrderReferenceProps } from './order-reference.props';

const VALID_PROPS: OrderReferenceProps = {
  orderId: '0199A7C0-0000-7000-8000-000000000001',
  customerId: '0199a7c0-0000-7000-8000-0000000000c1',
  lines: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 2 }],
};

describe('OrderReference', () => {
  describe('create', () => {
    it('should keep the order, customer (lowercased) and lines', () => {
      // Arrange
      const inputProps: OrderReferenceProps = VALID_PROPS;
      // Act
      const actualResult: Result<OrderReference, DomainError> =
        OrderReference.create(inputProps);
      // Assert
      const actualReference: OrderReference = actualResult.getValue();
      expect(actualReference.orderId).toBe(
        '0199a7c0-0000-7000-8000-000000000001',
      );
      expect(actualReference.customerId).toBe(VALID_PROPS.customerId);
      expect(actualReference.lines).toEqual(VALID_PROPS.lines);
    });
    it.each([
      {
        inputProps: { ...VALID_PROPS, orderId: 'order-1' },
        expectedErrorType: InvalidIdentifierError,
      },
      {
        inputProps: { ...VALID_PROPS, customerId: 'customer-1' },
        expectedErrorType: InvalidIdentifierError,
      },
      {
        inputProps: { ...VALID_PROPS, lines: [] },
        expectedErrorType: InvalidPaymentLinesError,
      },
      {
        inputProps: {
          ...VALID_PROPS,
          lines: [{ skuId: 'sku-1', quantity: 1 }],
        },
        expectedErrorType: InvalidPaymentLinesError,
      },
      {
        inputProps: {
          ...VALID_PROPS,
          lines: [{ skuId: VALID_PROPS.lines[0].skuId, quantity: 1.5 }],
        },
        expectedErrorType: InvalidPaymentLinesError,
      },
    ])(
      'should fail with $expectedErrorType.name',
      ({ inputProps, expectedErrorType }) => {
        // Arrange
        // Act
        const actualResult: Result<OrderReference, DomainError> =
          OrderReference.create(inputProps);
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
      },
    );
  });
});

import { Result } from '@org/shared-domain';
import { InvalidReservationError } from '../errors/invalid-reservation.error';
import { StockReservationProps } from './stock-reservation.props';
import { StockReservation } from './stock-reservation.vo';

const SKU_A = '0199a7c0-0000-7000-8000-0000000000a1';
const SKU_B = '0199a7c0-0000-7000-8000-0000000000a2';
const VALID_PROPS: StockReservationProps = {
  reservationKey: '0199a7c0-0000-7000-8000-0000000000c1:checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: [
    { skuId: SKU_A, quantity: 2 },
    { skuId: SKU_B, quantity: 1 },
  ],
};

describe('StockReservation', () => {
  describe('create', () => {
    it('should expose the key, order and lines', () => {
      // Arrange
      const inputProps: StockReservationProps = VALID_PROPS;
      // Act
      const actualReservation: StockReservation =
        StockReservation.create(inputProps).getValue();
      // Assert
      expect(actualReservation.reservationKey).toBe(VALID_PROPS.reservationKey);
      expect(actualReservation.orderId).toBe(VALID_PROPS.orderId);
      expect(actualReservation.items).toEqual(VALID_PROPS.items);
    });
    it.each([
      { scenario: 'a blank key', patch: { reservationKey: ' ' } },
      {
        scenario: 'a key over 200 characters',
        patch: { reservationKey: 'k'.repeat(201) },
      },
      { scenario: 'a non-UUID order', patch: { orderId: 'order-1' } },
      { scenario: 'no items', patch: { items: [] } },
      {
        scenario: 'a non-UUID SKU',
        patch: { items: [{ skuId: 'sku-test-101', quantity: 1 }] },
      },
      {
        scenario: 'a zero quantity',
        patch: { items: [{ skuId: SKU_A, quantity: 0 }] },
      },
      {
        scenario: 'a fractional quantity',
        patch: { items: [{ skuId: SKU_A, quantity: 1.5 }] },
      },
      {
        scenario: 'a duplicated SKU',
        patch: {
          items: [
            { skuId: SKU_A, quantity: 1 },
            { skuId: SKU_A, quantity: 2 },
          ],
        },
      },
    ])('should reject $scenario', ({ patch }) => {
      // Arrange
      const inputProps: StockReservationProps = { ...VALID_PROPS, ...patch };
      // Act
      const actualResult: Result<StockReservation, InvalidReservationError> =
        StockReservation.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidReservationError);
    });
  });
});

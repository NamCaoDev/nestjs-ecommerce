import { Result } from '@org/shared-domain';
import { CurrencyMismatchError } from '../errors/currency-mismatch.error';
import { InvalidMoneyError } from '../errors/invalid-money.error';
import { Money } from './money.vo';

/**
 * Creates a valid USD amount.
 */
const createUsd = (amount: number): Money =>
  Money.create({ amount, currency: 'USD' }).getValue();

describe('Money', () => {
  describe('create', () => {
    it.each([
      { inputAmount: -1, inputCurrency: 'USD' },
      { inputAmount: Number.NaN, inputCurrency: 'USD' },
      { inputAmount: 0.12345, inputCurrency: 'USD' },
      { inputAmount: 1, inputCurrency: 'usd' },
    ])(
      'should reject amount $inputAmount in $inputCurrency',
      ({ inputAmount, inputCurrency }) => {
        // Arrange
        const expectedError: typeof InvalidMoneyError = InvalidMoneyError;
        // Act
        const actualResult: Result<Money, InvalidMoneyError> = Money.create({
          amount: inputAmount,
          currency: inputCurrency,
        });
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedError);
      },
    );
    it('should accept up to four decimal places', () => {
      // Arrange
      const inputAmount: number = 19.9999;
      // Act
      const actualResult: Result<Money, InvalidMoneyError> = Money.create({
        amount: inputAmount,
        currency: 'USD',
      });
      // Assert
      expect(actualResult.getValue().amount).toBe(inputAmount);
    });
  });
  describe('add', () => {
    it('should add without floating point drift', () => {
      // Arrange
      const inputLeft: Money = createUsd(0.1);
      const inputRight: Money = createUsd(0.2);
      // Act
      const actualSum: Money = inputLeft.add(inputRight);
      // Assert
      expect(actualSum.amount).toBe(0.3);
    });
    it('should throw when currencies differ', () => {
      // Arrange
      const inputEuro: Money = Money.create({
        amount: 1,
        currency: 'EUR',
      }).getValue();
      // Act
      const actualAdd = (): Money => createUsd(1).add(inputEuro);
      // Assert
      expect(actualAdd).toThrow(CurrencyMismatchError);
    });
  });
  describe('multiply', () => {
    it('should multiply by a quantity exactly', () => {
      // Arrange
      const inputPrice: Money = createUsd(19.99);
      // Act
      const actualProduct: Money = inputPrice.multiply(3);
      // Assert
      expect(actualProduct.amount).toBe(59.97);
      expect(actualProduct.currency).toBe('USD');
    });
  });
  describe('equals', () => {
    it('should treat equal amount and currency as equal', () => {
      // Arrange
      const inputLeft: Money = createUsd(5);
      const inputRight: Money = createUsd(5);
      // Act
      const actualResult: boolean = inputLeft.equals(inputRight);
      // Assert
      expect(actualResult).toBe(true);
    });
  });
});

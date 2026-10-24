import { DomainError, Result } from '@org/shared-domain';
import { InvalidMoneyError } from '../errors/invalid-money.error';
import { Money } from './money.vo';

/**
 * Builds a valid USD amount.
 */
const usd = (amount: number): Money =>
  Money.create({ amount, currency: 'USD' }).getValue();

describe('Money', () => {
  describe('create', () => {
    it.each([0, 19.9999])('should accept %p', (inputAmount: number) => {
      // Arrange
      // Act
      const actualResult: Result<Money, DomainError> = Money.create({
        amount: inputAmount,
        currency: 'USD',
      });
      // Assert
      expect(actualResult.getValue().amount).toBe(inputAmount);
    });
    it.each([
      { inputAmount: -1, inputCurrency: 'USD' },
      { inputAmount: Number.NaN, inputCurrency: 'USD' },
      { inputAmount: 1.00001, inputCurrency: 'USD' },
      { inputAmount: 1, inputCurrency: 'usd' },
    ])(
      'should refuse $inputAmount $inputCurrency',
      ({ inputAmount, inputCurrency }) => {
        // Arrange
        // Act
        const actualResult: Result<Money, DomainError> = Money.create({
          amount: inputAmount,
          currency: inputCurrency,
        });
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(InvalidMoneyError);
      },
    );
  });
  describe('arithmetic', () => {
    it('should add and subtract exactly', () => {
      // Arrange
      const inputLeft: Money = usd(0.1);
      // Act
      const actualSum: Money = inputLeft.add(usd(0.2));
      const actualDifference: Money = actualSum.subtract(usd(0.1));
      // Assert
      expect(actualSum.amount).toBe(0.3);
      expect(actualDifference.amount).toBe(0.2);
    });
    it('should compare amounts', () => {
      // Arrange
      const inputAmount: Money = usd(10);
      // Act
      const actualComparisons: boolean[] = [
        inputAmount.isGreaterThanOrEqual(usd(10)),
        inputAmount.isGreaterThanOrEqual(usd(10.0001)),
        inputAmount.isPositive(),
        Money.zero('USD').isPositive(),
      ];
      // Assert
      expect(actualComparisons).toEqual([true, false, true, false]);
    });
    it('should refuse to mix currencies or go below zero', () => {
      // Arrange
      const inputAmount: Money = usd(1);
      const inputEuro: Money = Money.create({
        amount: 1,
        currency: 'EUR',
      }).getValue();
      // Act
      const actualAdd: () => Money = () => inputAmount.add(inputEuro);
      const actualSubtract: () => Money = () => inputAmount.subtract(usd(2));
      // Assert
      expect(actualAdd).toThrow(InvalidMoneyError);
      expect(actualSubtract).toThrow(InvalidMoneyError);
    });
  });
});

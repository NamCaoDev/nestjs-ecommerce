import { Result, ValueObject } from '@org/shared-domain';
import { CurrencyMismatchError } from '../errors/currency-mismatch.error';
import { InvalidMoneyError } from '../errors/invalid-money.error';
import { MoneyProps } from './money.props';

/** Number of decimal places kept, matching the `Decimal(19, 4)` persistence columns. */
const DECIMAL_PLACES = 4;

/** Multiplier turning an amount into an exact integer of 1/10 000 units. */
const SCALE_FACTOR: number = 10 ** DECIMAL_PLACES;

/** ISO 4217 alphabetic currency code. */
const CURRENCY_CODE_PATTERN: RegExp = /^[A-Z]{3}$/;

/**
 * Converts an amount to an exact integer at {@link SCALE_FACTOR} precision.
 */
const toScaled = (amount: number): number => Math.round(amount * SCALE_FACTOR);

/**
 * Monetary amount in a single currency.
 *
 * Arithmetic is performed on scaled integers, so `0.1 + 0.2` yields exactly `0.3`.
 */
export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  /**
   * Creates a monetary amount.
   *
   * @param props - Amount and currency.
   * @returns The money value, or an {@link InvalidMoneyError} when a rule is violated.
   */
  public static create({
    amount,
    currency,
  }: MoneyProps): Result<Money, InvalidMoneyError> {
    if (!Number.isFinite(amount) || amount < 0) {
      return Result.fail(new InvalidMoneyError('amount must be non-negative'));
    }
    if (toScaled(amount) / SCALE_FACTOR !== amount) {
      return Result.fail(
        new InvalidMoneyError(`amount exceeds ${DECIMAL_PLACES} decimals`),
      );
    }
    if (!CURRENCY_CODE_PATTERN.test(currency)) {
      return Result.fail(new InvalidMoneyError('currency must be ISO 4217'));
    }
    return Result.ok(new Money({ amount, currency }));
  }

  /**
   * @returns The amount in major currency units.
   */
  public get amount(): number {
    return this.props.amount;
  }

  /**
   * @returns The ISO 4217 currency code.
   */
  public get currency(): string {
    return this.props.currency;
  }

  /**
   * Adds another amount in the same currency.
   *
   * @param other - Amount to add.
   * @returns The sum.
   * @throws {CurrencyMismatchError} When the currencies differ (invariant violation).
   */
  public add(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError();
    }
    const scaledSum: number = toScaled(this.amount) + toScaled(other.amount);
    return new Money({
      amount: scaledSum / SCALE_FACTOR,
      currency: this.currency,
    });
  }

  /**
   * Multiplies the amount by a whole quantity.
   *
   * @param quantity - Non-negative integer factor.
   * @returns The product.
   */
  public multiply(quantity: number): Money {
    const scaledProduct: number = toScaled(this.amount) * quantity;
    return new Money({
      amount: scaledProduct / SCALE_FACTOR,
      currency: this.currency,
    });
  }

  /**
   * Creates a zero amount in the given currency.
   *
   * @param currency - ISO 4217 currency code of an existing, valid amount.
   * @returns A zero amount.
   */
  public static zero(currency: string): Money {
    return new Money({ amount: 0, currency });
  }
}

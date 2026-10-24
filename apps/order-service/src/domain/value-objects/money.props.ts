/**
 * Attributes of a {@link Money} value.
 */
export interface MoneyProps {
  /** Non-negative amount in major currency units, with at most 4 decimal places. */
  readonly amount: number;
  /** ISO 4217 currency code, e.g. `USD`. */
  readonly currency: string;
}

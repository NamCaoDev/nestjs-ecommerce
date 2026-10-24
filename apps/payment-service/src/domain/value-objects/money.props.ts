/**
 * State of a {@link Money} value.
 */
export interface MoneyProps {
  /** Amount in major currency units, at most 4 decimals. */
  readonly amount: number;
  /** ISO 4217 alphabetic currency code. */
  readonly currency: string;
}

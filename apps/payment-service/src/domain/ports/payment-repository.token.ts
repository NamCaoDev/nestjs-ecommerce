/**
 * Dependency-injection token for {@link PaymentRepositoryPort}.
 * Kept in its own file to honour the one-export-per-file rule.
 */
export const PAYMENT_REPOSITORY_PORT: unique symbol = Symbol(
  'PAYMENT_REPOSITORY_PORT',
);

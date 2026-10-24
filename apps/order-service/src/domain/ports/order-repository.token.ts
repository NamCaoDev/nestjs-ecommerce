/**
 * Dependency-injection token for {@link OrderRepositoryPort}.
 * Kept in its own file to honour the one-export-per-file rule.
 */
export const ORDER_REPOSITORY_PORT: unique symbol = Symbol(
  'ORDER_REPOSITORY_PORT',
);

/**
 * Identity and audit timestamps required to construct an {@link Entity}.
 * Timestamps are epoch milliseconds, following the domain-wide time convention.
 *
 * @typeParam TId - Type of the entity identifier (a primitive or an identifier Value Object).
 */
export interface EntityProps<TId> {
  /** Unique identifier of the entity. */
  readonly id: TId;
  /** Creation time in epoch milliseconds; defaults to the construction time. */
  readonly createdAt?: number;
  /** Last modification time in epoch milliseconds; defaults to `createdAt`. */
  readonly updatedAt?: number;
}

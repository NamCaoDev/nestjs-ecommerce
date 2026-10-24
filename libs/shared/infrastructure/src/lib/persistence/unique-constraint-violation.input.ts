/**
 * Input of {@link isUniqueConstraintViolation}.
 */
export interface UniqueConstraintViolationInput {
  /** Error thrown by Prisma. */
  readonly error: unknown;
  /** Name of the unique index, as reported by the driver adapter (Prisma 7). */
  readonly indexName: string;
  /** A column of the index, as reported in `meta.target` by the classic engine. */
  readonly columnName: string;
}

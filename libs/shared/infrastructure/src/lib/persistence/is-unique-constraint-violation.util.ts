import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { UniqueConstraintViolationInput } from './unique-constraint-violation.input';

/** Prisma error code for a unique constraint violation. */
const UNIQUE_CONSTRAINT_VIOLATION_CODE = 'P2002';

/**
 * Unique-violation metadata. Prisma 7 driver adapters report the index under
 * `driverAdapterError.cause.constraint`, while the classic engine uses `target`.
 */
interface UniqueViolationMeta {
  readonly target?: string | readonly string[];
  readonly driverAdapterError?: {
    readonly cause?: { readonly constraint?: { readonly index?: string } };
  };
}

/**
 * Checks whether a Prisma error is a `P2002` violation of a given unique index, for both the
 * driver-adapter (`meta.driverAdapterError`) and the classic (`meta.target`) error shapes.
 *
 * @param input - Error, index name and one of its columns.
 * @returns `true` when the error violates that index.
 */
export function isUniqueConstraintViolation({
  error,
  indexName,
  columnName,
}: UniqueConstraintViolationInput): boolean {
  if (
    !(error instanceof PrismaClientKnownRequestError) ||
    error.code !== UNIQUE_CONSTRAINT_VIOLATION_CODE
  ) {
    return false;
  }
  const meta: UniqueViolationMeta = error.meta ?? {};
  return (
    meta.driverAdapterError?.cause?.constraint?.index === indexName ||
    [meta.target ?? []].flat().includes(columnName)
  );
}

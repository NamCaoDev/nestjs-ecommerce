/** Shape of driver errors that carry a code but sometimes an empty message (e.g. `AggregateError`). */
interface DriverError {
  readonly message?: string;
  readonly code?: string;
  readonly name?: string;
}

/**
 * Describes a driver error on one line: its code (e.g. `ECONNREFUSED`, which Prisma reports while the
 * message only says "Invalid invocation"), then its message with whitespace collapsed, falling back
 * to its name.
 *
 * @param cause - Underlying error.
 * @returns A non-empty, single-line description.
 */
function describeCause(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null) {
    return String(cause);
  }
  const { message = '', code = '', name = '' }: DriverError = cause;
  const details: string[] = [code, message.replace(/\s+/g, ' ').trim()].filter(
    (detail: string): boolean => detail.length > 0,
  );
  return details.length > 0 ? details.join(': ') : name || 'unknown error';
}

/**
 * Raised at startup when a service cannot reach its database.
 */
export class DatabaseConnectionError extends Error {
  /**
   * @param input - Service name and the underlying driver error.
   */
  public constructor({
    serviceName,
    cause,
  }: {
    readonly serviceName: string;
    readonly cause: unknown;
  }) {
    super(`${serviceName} cannot reach its database: ${describeCause(cause)}`, {
      cause,
    });
    this.name = DatabaseConnectionError.name;
  }
}

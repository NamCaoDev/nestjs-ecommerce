/** Error message thrown when the value of a failed result is read. */
const VALUE_OF_FAILURE_MESSAGE =
  'Cannot read the value of a failed Result. Check isFailure first.';

/** Error message thrown when the error of a successful result is read. */
const ERROR_OF_SUCCESS_MESSAGE =
  'Cannot read the error of a successful Result. Check isSuccess first.';

/**
 * Internal state of a {@link Result}.
 */
interface ResultState<TValue, TError> {
  readonly isSuccess: boolean;
  readonly value?: TValue;
  readonly error?: TError;
}

/**
 * Explicit outcome of an operation that can fail for an expected business reason,
 * used instead of throwing exceptions for non-exceptional control flow.
 *
 * Reading the wrong side (`getValue()` on a failure or `getError()` on a success) is a programming
 * error and throws.
 *
 * @typeParam TValue - Type of the success value.
 * @typeParam TError - Type of the failure reason; defaults to `Error`.
 *
 * @example
 * const result: Result<Money> = Money.create(-1, 'USD');
 * if (result.isFailure) {
 *   return Result.fail(result.getError());
 * }
 */
export class Result<TValue, TError = Error> {
  /** `true` when the operation succeeded. */
  public readonly isSuccess: boolean;
  readonly #value?: TValue;
  readonly #error?: TError;

  /**
   * @param state - Outcome flag and the matching value or error.
   */
  private constructor({
    isSuccess,
    value,
    error,
  }: ResultState<TValue, TError>) {
    this.isSuccess = isSuccess;
    this.#value = value;
    this.#error = error;
    Object.freeze(this);
  }

  /**
   * @returns `true` when the operation failed.
   */
  public get isFailure(): boolean {
    return !this.isSuccess;
  }

  /**
   * Creates a successful result without a value, for operations that only signal completion.
   *
   * @returns A successful `Result<void, never>`, assignable to any `Result<void, TError>`.
   */
  public static ok(): Result<void, never>;
  /**
   * Creates a successful result.
   *
   * @param value - Value produced by the operation.
   * @returns A successful result holding `value`.
   */
  public static ok<TValue, TError = Error>(
    value: TValue,
  ): Result<TValue, TError>;
  public static ok<TValue, TError>(value?: TValue): Result<TValue, TError> {
    return new Result<TValue, TError>({ isSuccess: true, value });
  }

  /**
   * Creates a failed result.
   *
   * @param error - Reason the operation failed.
   * @returns A failed result holding `error`.
   */
  public static fail<TValue, TError = Error>(
    error: TError,
  ): Result<TValue, TError> {
    return new Result<TValue, TError>({ isSuccess: false, error });
  }

  /**
   * @returns The success value.
   * @throws {Error} When the result is a failure.
   */
  public getValue(): TValue {
    if (this.isFailure) {
      throw new Error(VALUE_OF_FAILURE_MESSAGE);
    }
    return this.#value as TValue;
  }

  /**
   * @returns The failure reason.
   * @throws {Error} When the result is a success.
   */
  public getError(): TError {
    if (this.isSuccess) {
      throw new Error(ERROR_OF_SUCCESS_MESSAGE);
    }
    return this.#error as TError;
  }
}

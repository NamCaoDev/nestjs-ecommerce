import { Result, ValueObject } from '@org/shared-domain';
import { InvalidOrderCodeError } from '../errors/invalid-order-code.error';

/** `ORD-` followed by 6 to 28 upper-case alphanumerics; at most 32 characters (`VARCHAR(32)`). */
const ORDER_CODE_PATTERN: RegExp = /^ORD-[0-9A-Z]{6,28}$/;

/**
 * Customer-facing, unique order reference, e.g. `ORD-1A2B3C4D5E6F`.
 */
export class OrderCode extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  /**
   * @param value - Candidate order code.
   * @returns The order code, or an {@link InvalidOrderCodeError} when the format is wrong.
   */
  public static create(
    value: string,
  ): Result<OrderCode, InvalidOrderCodeError> {
    if (!ORDER_CODE_PATTERN.test(value)) {
      return Result.fail(new InvalidOrderCodeError(value));
    }
    return Result.ok(new OrderCode(value));
  }

  /**
   * @returns The order code string.
   */
  public get value(): string {
    return this.props;
  }
}

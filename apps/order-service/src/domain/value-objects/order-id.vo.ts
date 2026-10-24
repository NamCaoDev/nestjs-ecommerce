import { Result, ValueObject } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { isUuid } from '../utils/is-uuid.util';

/**
 * Identity of an {@link Order}: a UUID assigned by the application layer.
 */
export class OrderId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates an order identifier from its string form.
   *
   * @param value - UUID string.
   * @returns The identifier, or an {@link InvalidIdentifierError} when `value` is not a UUID.
   */
  public static create(value: string): Result<OrderId, InvalidIdentifierError> {
    if (!isUuid(value)) {
      return Result.fail(new InvalidIdentifierError('orderId'));
    }
    return Result.ok(new OrderId(value.toLowerCase()));
  }

  /**
   * @returns The UUID string.
   */
  public get value(): string {
    return this.props;
  }
}

import { Result, ValueObject } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { isUuid } from '../utils/is-uuid.util';

/**
 * Identity of a {@link Payment}: a UUID assigned by the application layer.
 */
export class PaymentId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  /**
   * Creates a payment identifier from its string form.
   *
   * @param value - UUID string.
   * @returns The identifier, or an {@link InvalidIdentifierError} when `value` is not a UUID.
   */
  public static create(
    value: string,
  ): Result<PaymentId, InvalidIdentifierError> {
    if (!isUuid(value)) {
      return Result.fail(new InvalidIdentifierError('paymentId'));
    }
    return Result.ok(new PaymentId(value.toLowerCase()));
  }

  /**
   * @returns The UUID string.
   */
  public get value(): string {
    return this.props;
  }
}

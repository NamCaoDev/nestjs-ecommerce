import { DomainError, Result, ValueObject } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { InvalidPaymentLinesError } from '../errors/invalid-payment-lines.error';
import { isUuid } from '../utils/is-uuid.util';
import { OrderReferenceProps } from './order-reference.props';
import { PaymentLine } from './payment-line.type';

/**
 * Immutable snapshot of the order a payment belongs to: logical order and customer identifiers
 * (no cross-service foreign keys) and the ordered lines, forwarded to the inventory with the outcome.
 */
export class OrderReference extends ValueObject<OrderReferenceProps> {
  private constructor(props: OrderReferenceProps) {
    super(props);
  }

  /**
   * Creates an order reference.
   *
   * @param props - Order, customer and lines.
   * @returns The reference, or a {@link DomainError} when an identifier or a line is invalid.
   */
  public static create(
    props: OrderReferenceProps,
  ): Result<OrderReference, DomainError> {
    if (!isUuid(props.orderId)) {
      return Result.fail(new InvalidIdentifierError('orderId'));
    }
    if (!isUuid(props.customerId)) {
      return Result.fail(new InvalidIdentifierError('customerId'));
    }
    if (props.lines.length === 0) {
      return Result.fail(new InvalidPaymentLinesError('no lines'));
    }
    if (!props.lines.every(OrderReference.isValidLine)) {
      return Result.fail(
        new InvalidPaymentLinesError(
          'every line needs a UUID skuId and a positive whole quantity',
        ),
      );
    }
    return Result.ok(
      new OrderReference({
        orderId: props.orderId.toLowerCase(),
        customerId: props.customerId.toLowerCase(),
        lines: props.lines.map(
          ({ skuId, quantity }: PaymentLine): PaymentLine => ({
            skuId,
            quantity,
          }),
        ),
      }),
    );
  }

  /**
   * @returns The logical order identifier.
   */
  public get orderId(): string {
    return this.props.orderId;
  }

  /**
   * @returns The logical customer identifier.
   */
  public get customerId(): string {
    return this.props.customerId;
  }

  /**
   * @returns The ordered lines.
   */
  public get lines(): readonly PaymentLine[] {
    return this.props.lines;
  }

  /**
   * @returns `true` when the line names a SKU by UUID and a positive whole quantity.
   */
  private static isValidLine({ skuId, quantity }: PaymentLine): boolean {
    return isUuid(skuId) && Number.isInteger(quantity) && quantity > 0;
  }
}

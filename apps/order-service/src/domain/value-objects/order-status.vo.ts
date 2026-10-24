import { Result, ValueObject } from '@org/shared-domain';
import { InvalidOrderStatusError } from '../errors/invalid-order-status.error';
import { OrderStatusValue } from './order-status-value.type';

/** Every valid order status value. */
const ORDER_STATUS_VALUES: readonly OrderStatusValue[] = [
  'PENDING',
  'CONFIRMED',
  'PAYMENT_FAILED',
  'CANCELLED',
] as const;

/**
 * Lifecycle status of an order. Instances are canonical singletons
 * (`OrderStatus.PENDING`, ...), so they can also be compared with {@link ValueObject.equals}.
 */
export class OrderStatus extends ValueObject<OrderStatusValue> {
  /** Order placed and awaiting confirmation. */
  public static readonly PENDING: OrderStatus = new OrderStatus('PENDING');
  /** Order confirmed after successful payment. */
  public static readonly CONFIRMED: OrderStatus = new OrderStatus('CONFIRMED');
  /** Payment was declined or failed. */
  public static readonly PAYMENT_FAILED: OrderStatus = new OrderStatus(
    'PAYMENT_FAILED',
  );
  /** Order cancelled before confirmation. */
  public static readonly CANCELLED: OrderStatus = new OrderStatus('CANCELLED');

  private constructor(value: OrderStatusValue) {
    super(value);
  }

  /**
   * Resolves a raw value, e.g. from persistence, to its canonical status.
   *
   * @param value - Raw status value.
   * @returns The matching status, or an {@link InvalidOrderStatusError} for unknown values.
   */
  public static create(
    value: string,
  ): Result<OrderStatus, InvalidOrderStatusError> {
    const matchedValue: OrderStatusValue | undefined = ORDER_STATUS_VALUES.find(
      (statusValue: OrderStatusValue): boolean => statusValue === value,
    );
    if (matchedValue === undefined) {
      return Result.fail(new InvalidOrderStatusError(value));
    }
    return Result.ok(OrderStatus[matchedValue]);
  }

  /**
   * @returns The raw status value.
   */
  public get value(): OrderStatusValue {
    return this.props;
  }

  /**
   * @returns `true` when the order is still awaiting confirmation.
   */
  public isPending(): boolean {
    return this.equals(OrderStatus.PENDING);
  }
}

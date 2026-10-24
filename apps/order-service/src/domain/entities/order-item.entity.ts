import { DomainError, Entity, Result } from '@org/shared-domain';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { InvalidOrderItemError } from '../errors/invalid-order-item.error';
import { isBlank } from '../utils/is-blank.util';
import { isUuid } from '../utils/is-uuid.util';
import { Money } from '../value-objects/money.vo';
import { OrderItemProps } from './order-item.props';

/**
 * Line of an {@link Order}. Identified within its aggregate by the SKU, which appears at most once per order.
 */
export class OrderItem extends Entity<string> {
  /** Product name captured at purchase time. */
  public readonly productName: string;
  /** Number of units ordered. */
  public readonly quantity: number;
  /** Unit price captured at purchase time. */
  public readonly unitPrice: Money;

  private constructor({
    skuId,
    productName,
    quantity,
    unitPrice,
  }: OrderItemProps) {
    super({ id: skuId });
    this.productName = productName;
    this.quantity = quantity;
    this.unitPrice = unitPrice;
  }

  /**
   * Creates an order line.
   *
   * @param props - SKU, product name, quantity and unit price.
   * @returns The line, or a {@link DomainError} when the SKU, name or quantity is invalid.
   */
  public static create(props: OrderItemProps): Result<OrderItem, DomainError> {
    if (!isUuid(props.skuId)) {
      return Result.fail(new InvalidIdentifierError('skuId'));
    }
    if (isBlank(props.productName)) {
      return Result.fail(new InvalidOrderItemError('productName is required'));
    }
    if (!Number.isInteger(props.quantity) || props.quantity <= 0) {
      return Result.fail(
        new InvalidOrderItemError('quantity must be a positive integer'),
      );
    }
    return Result.ok(new OrderItem(props));
  }

  /**
   * @returns The logical SKU identifier.
   */
  public get skuId(): string {
    return this.id;
  }

  /**
   * @returns Unit price multiplied by quantity.
   */
  public get lineTotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }
}

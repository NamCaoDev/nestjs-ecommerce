import { AggregateRoot, DomainError, Result } from '@org/shared-domain';
import { OrderItem } from '../entities/order-item.entity';
import { CurrencyMismatchError } from '../errors/currency-mismatch.error';
import { DuplicateOrderItemError } from '../errors/duplicate-order-item.error';
import { EmptyOrderError } from '../errors/empty-order.error';
import { InvalidCancellationReasonError } from '../errors/invalid-cancellation-reason.error';
import { InvalidIdentifierError } from '../errors/invalid-identifier.error';
import { InvalidOrderStatusTransitionError } from '../errors/invalid-order-status-transition.error';
import { OrderCancelledEvent } from '../events/order-cancelled.event';
import { OrderConfirmedEvent } from '../events/order-confirmed.event';
import { OrderPlacedEvent } from '../events/order-placed.event';
import { isBlank } from '../utils/is-blank.util';
import { isUuid } from '../utils/is-uuid.util';
import { AddressSnapshot } from '../value-objects/address-snapshot.vo';
import { Money } from '../value-objects/money.vo';
import { OrderCode } from '../value-objects/order-code.vo';
import { OrderId } from '../value-objects/order-id.vo';
import { OrderStatus } from '../value-objects/order-status.vo';
import { CreateOrderProps } from './create-order.props';
import { OrderProps } from './order.props';

/** Version of a newly created order, before its first persistence. */
const INITIAL_VERSION = 1;

/**
 * Order aggregate root: the consistency boundary for an order and its lines.
 *
 * Invariants:
 * - an order has at least one line, each SKU appears once, and all prices share one currency;
 * - only a `PENDING` order can be confirmed or cancelled.
 *
 * Every state change records a domain event for the transactional outbox.
 */
export class Order extends AggregateRoot<OrderId> {
  /** Unique customer-facing reference. */
  public readonly orderCode: OrderCode;
  /** Logical customer identifier (UUID); no cross-service foreign key. */
  public readonly customerId: string;
  /** Shipping address captured when the order was placed. */
  public readonly shippingAddress: AddressSnapshot;
  /** Optimistic concurrency version as loaded from persistence. */
  public readonly version: number;
  readonly #items: readonly OrderItem[];
  #status: OrderStatus;

  private constructor(props: OrderProps) {
    super({
      id: props.id,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
    this.orderCode = props.orderCode;
    this.customerId = props.customerId;
    this.shippingAddress = props.shippingAddress;
    this.version = props.version;
    this.#items = Object.freeze([...props.items]);
    this.#status = props.status;
  }

  /**
   * Places a new order in `PENDING` status and records an {@link OrderPlacedEvent}.
   *
   * @param props - Identifier, customer, lines and shipping address.
   * @returns The order, or a {@link DomainError} when an invariant is violated.
   */
  public static create(props: CreateOrderProps): Result<Order, DomainError> {
    const creationError: DomainError | undefined =
      Order.findCreationError(props);
    if (creationError !== undefined) {
      return Result.fail(creationError);
    }
    const order: Order = new Order({
      ...props,
      status: OrderStatus.PENDING,
      version: INITIAL_VERSION,
    });
    order.addDomainEvent(order.buildPlacedEvent());
    return Result.ok(order);
  }

  /**
   * Rebuilds an order from persisted state without re-running creation rules or raising events.
   *
   * @param props - Complete persisted state.
   * @returns The rehydrated order.
   */
  public static restore(props: OrderProps): Order {
    return new Order(props);
  }

  /**
   * @returns The order lines (read-only).
   */
  public get items(): readonly OrderItem[] {
    return this.#items;
  }

  /**
   * @returns The current lifecycle status.
   */
  public get status(): OrderStatus {
    return this.#status;
  }

  /**
   * @returns The sum of every line total.
   */
  public get totalAmount(): Money {
    const currency: string = this.#items[0].unitPrice.currency;
    return this.#items.reduce(
      (total: Money, item: OrderItem): Money => total.add(item.lineTotal),
      Money.zero(currency),
    );
  }

  /**
   * Confirms a pending order and records an {@link OrderConfirmedEvent}.
   *
   * @returns Success, or an {@link InvalidOrderStatusTransitionError} when the order is not pending.
   */
  public confirm(): Result<void, DomainError> {
    if (!this.#status.isPending()) {
      return Result.fail(this.buildTransitionError(OrderStatus.CONFIRMED));
    }
    this.#status = OrderStatus.CONFIRMED;
    this.touch();
    this.addDomainEvent(
      new OrderConfirmedEvent({
        orderId: this.id.value,
        occurredAt: this.updatedAt,
      }),
    );
    return Result.ok();
  }

  /**
   * Cancels a pending order and records an {@link OrderCancelledEvent} so stock can be released.
   *
   * @param reason - Why the order is cancelled.
   * @returns Success, or a {@link DomainError} when the reason is blank or the order is not pending.
   */
  public cancel(reason: string): Result<void, DomainError> {
    if (isBlank(reason)) {
      return Result.fail(new InvalidCancellationReasonError());
    }
    if (!this.#status.isPending()) {
      return Result.fail(this.buildTransitionError(OrderStatus.CANCELLED));
    }
    this.#status = OrderStatus.CANCELLED;
    this.touch();
    this.addDomainEvent(this.buildCancelledEvent(reason));
    return Result.ok();
  }

  /**
   * Checks the creation invariants.
   *
   * @returns The first violated rule, or `undefined` when the input is valid.
   */
  private static findCreationError({
    customerId,
    items,
  }: CreateOrderProps): DomainError | undefined {
    if (!isUuid(customerId)) {
      return new InvalidIdentifierError('customerId');
    }
    if (items.length === 0) {
      return new EmptyOrderError();
    }
    const duplicateSkuId: string | undefined = Order.findDuplicateSkuId(items);
    if (duplicateSkuId !== undefined) {
      return new DuplicateOrderItemError(duplicateSkuId);
    }
    if (!Order.hasSingleCurrency(items)) {
      return new CurrencyMismatchError();
    }
    return undefined;
  }

  /**
   * @returns The first SKU that appears on more than one line, if any.
   */
  private static findDuplicateSkuId(
    items: readonly OrderItem[],
  ): string | undefined {
    return items.find(
      (item: OrderItem, index: number): boolean =>
        items.findIndex(
          (other: OrderItem): boolean => other.skuId === item.skuId,
        ) !== index,
    )?.skuId;
  }

  /**
   * @returns `true` when every line is priced in the same currency.
   */
  private static hasSingleCurrency(items: readonly OrderItem[]): boolean {
    const currency: string = items[0].unitPrice.currency;
    return items.every(
      (item: OrderItem): boolean => item.unitPrice.currency === currency,
    );
  }

  /**
   * @returns The event describing this order at placement time.
   */
  private buildPlacedEvent(): OrderPlacedEvent {
    const totalAmount: Money = this.totalAmount;
    return new OrderPlacedEvent({
      orderId: this.id.value,
      customerId: this.customerId,
      totalAmount: totalAmount.amount,
      currency: totalAmount.currency,
      items: this.#items.map(
        (
          item: OrderItem,
        ): { skuId: string; quantity: number; unitPrice: number } => ({
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.amount,
        }),
      ),
      occurredAt: this.createdAt,
    });
  }

  /**
   * @returns The event describing this cancellation.
   */
  private buildCancelledEvent(reason: string): OrderCancelledEvent {
    return new OrderCancelledEvent({
      orderId: this.id.value,
      reason,
      items: this.#items.map(
        (item: OrderItem): { skuId: string; quantity: number } => ({
          skuId: item.skuId,
          quantity: item.quantity,
        }),
      ),
      occurredAt: this.updatedAt,
    });
  }

  /**
   * @returns The error for a forbidden move from the current status to `target`.
   */
  private buildTransitionError(
    target: OrderStatus,
  ): InvalidOrderStatusTransitionError {
    return new InvalidOrderStatusTransitionError({
      from: this.#status.value,
      to: target.value,
    });
  }
}

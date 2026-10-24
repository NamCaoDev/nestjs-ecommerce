import { DomainError, DomainEvent, Result } from '@org/shared-domain';
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
import { AddressSnapshot } from '../value-objects/address-snapshot.vo';
import { Money } from '../value-objects/money.vo';
import { OrderCode } from '../value-objects/order-code.vo';
import { OrderId } from '../value-objects/order-id.vo';
import { OrderStatus } from '../value-objects/order-status.vo';
import { CreateOrderProps } from './create-order.props';
import { Order } from './order.aggregate';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';
const MUG_SKU_ID = '0199a7c0-0000-7000-8000-0000000000a1';
const PEN_SKU_ID = '0199a7c0-0000-7000-8000-0000000000a2';
const PLACED_AT = Date.UTC(2026, 9, 24, 8);
const CHANGED_AT = Date.UTC(2026, 9, 24, 9);

/**
 * Builds a valid order line priced in `currency`.
 */
function createMockItem({
  skuId = MUG_SKU_ID,
  quantity = 1,
  unitPrice = 10,
  currency = 'USD',
}: {
  skuId?: string;
  quantity?: number;
  unitPrice?: number;
  currency?: string;
} = {}): OrderItem {
  return OrderItem.create({
    skuId,
    productName: 'Product',
    quantity,
    unitPrice: Money.create({ amount: unitPrice, currency }).getValue(),
  }).getValue();
}

/**
 * Builds valid order creation input, optionally overriding the lines or customer.
 */
function createInputProps(
  overrides: Partial<CreateOrderProps> = {},
): CreateOrderProps {
  return {
    id: OrderId.create(ORDER_ID).getValue(),
    orderCode: OrderCode.create('ORD-000000000001').getValue(),
    customerId: CUSTOMER_ID,
    items: [createMockItem()],
    shippingAddress: AddressSnapshot.create({
      recipientName: 'Nguyen Van A',
      phoneNumber: '+84900000000',
      line1: '1 Le Loi',
      city: 'Ho Chi Minh City',
      postalCode: '700000',
      countryCode: 'VN',
    }).getValue(),
    ...overrides,
  };
}

/**
 * Places a valid pending order and discards its creation event.
 */
function createPendingOrder(): Order {
  const order: Order = Order.create(createInputProps()).getValue();
  order.clearEvents();
  return order;
}

describe('Order', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: PLACED_AT });
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  describe('create', () => {
    it('should place a pending order at the initial version', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps();
      // Act
      const actualResult: Result<Order, DomainError> = Order.create(inputProps);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(actualResult.getValue().status).toBe(OrderStatus.PENDING);
      expect(actualResult.getValue().version).toBe(1);
      expect(actualResult.getValue().createdAt).toBe(PLACED_AT);
    });
    it('should compute the total exactly from every line', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps({
        items: [
          createMockItem({ skuId: MUG_SKU_ID, quantity: 3, unitPrice: 0.1 }),
          createMockItem({ skuId: PEN_SKU_ID, quantity: 1, unitPrice: 0.2 }),
        ],
      });
      const expectedTotal: number = 0.5;
      // Act
      const actualOrder: Order = Order.create(inputProps).getValue();
      // Assert
      expect(actualOrder.totalAmount.amount).toBe(expectedTotal);
      expect(actualOrder.totalAmount.currency).toBe('USD');
    });
    it('should record an OrderPlacedEvent with the lines and total', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps({
        items: [createMockItem({ quantity: 2, unitPrice: 19.99 })],
      });
      // Act
      const actualOrder: Order = Order.create(inputProps).getValue();
      // Assert
      const actualEvent: DomainEvent = actualOrder.domainEvents[0];
      expect(actualOrder.domainEvents).toHaveLength(1);
      expect(actualEvent).toBeInstanceOf(OrderPlacedEvent);
      expect(actualEvent).toMatchObject({
        eventName: 'order.placed',
        aggregateId: ORDER_ID,
        customerId: CUSTOMER_ID,
        totalAmount: 39.98,
        currency: 'USD',
        items: [{ skuId: MUG_SKU_ID, quantity: 2, unitPrice: 19.99 }],
        occurredAt: PLACED_AT,
      });
    });
    it('should reject an order without items', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps({ items: [] });
      // Act
      const actualResult: Result<Order, DomainError> = Order.create(inputProps);
      // Assert
      expect(actualResult.isFailure).toBe(true);
      expect(actualResult.getError()).toBeInstanceOf(EmptyOrderError);
    });
    it('should reject the same SKU on two lines', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps({
        items: [createMockItem(), createMockItem()],
      });
      // Act
      const actualResult: Result<Order, DomainError> = Order.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(DuplicateOrderItemError);
    });
    it('should reject lines priced in different currencies', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps({
        items: [
          createMockItem({ skuId: MUG_SKU_ID, currency: 'USD' }),
          createMockItem({ skuId: PEN_SKU_ID, currency: 'EUR' }),
        ],
      });
      // Act
      const actualResult: Result<Order, DomainError> = Order.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(CurrencyMismatchError);
    });
    it('should reject a customer identifier that is not a UUID', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps({
        customerId: 'customer-1',
      });
      // Act
      const actualResult: Result<Order, DomainError> = Order.create(inputProps);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidIdentifierError);
    });
  });
  describe('confirm', () => {
    it('should move a pending order to CONFIRMED and record an OrderConfirmedEvent', () => {
      // Arrange
      const inputOrder: Order = createPendingOrder();
      jest.setSystemTime(CHANGED_AT);
      // Act
      const actualResult: Result<void, DomainError> = inputOrder.confirm();
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(inputOrder.status).toBe(OrderStatus.CONFIRMED);
      expect(inputOrder.updatedAt).toBe(CHANGED_AT);
      expect(inputOrder.domainEvents).toHaveLength(1);
      expect(inputOrder.domainEvents[0]).toBeInstanceOf(OrderConfirmedEvent);
      expect(inputOrder.domainEvents[0].occurredAt).toBe(CHANGED_AT);
    });
    it('should reject confirming an order that is not pending', () => {
      // Arrange
      const inputOrder: Order = createPendingOrder();
      inputOrder.confirm();
      inputOrder.clearEvents();
      // Act
      const actualResult: Result<void, DomainError> = inputOrder.confirm();
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        InvalidOrderStatusTransitionError,
      );
      expect(inputOrder.domainEvents).toHaveLength(0);
    });
  });
  describe('cancel', () => {
    it('should move a pending order to CANCELLED and record the items to release', () => {
      // Arrange
      const inputOrder: Order = createPendingOrder();
      const inputReason: string = 'Customer changed their mind';
      // Act
      const actualResult: Result<void, DomainError> =
        inputOrder.cancel(inputReason);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(inputOrder.status).toBe(OrderStatus.CANCELLED);
      expect(inputOrder.domainEvents[0]).toBeInstanceOf(OrderCancelledEvent);
      expect(inputOrder.domainEvents[0]).toMatchObject({
        eventName: 'order.cancelled',
        aggregateId: ORDER_ID,
        reason: inputReason,
        items: [{ skuId: MUG_SKU_ID, quantity: 1 }],
      });
    });
    it('should reject cancelling an order that is no longer pending', () => {
      // Arrange
      const inputOrder: Order = createPendingOrder();
      inputOrder.confirm();
      inputOrder.clearEvents();
      // Act
      const actualResult: Result<void, DomainError> =
        inputOrder.cancel('Too late');
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        InvalidOrderStatusTransitionError,
      );
      expect(inputOrder.status).toBe(OrderStatus.CONFIRMED);
      expect(inputOrder.domainEvents).toHaveLength(0);
    });
    it('should reject a blank cancellation reason', () => {
      // Arrange
      const inputOrder: Order = createPendingOrder();
      // Act
      const actualResult: Result<void, DomainError> = inputOrder.cancel('   ');
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        InvalidCancellationReasonError,
      );
      expect(inputOrder.status).toBe(OrderStatus.PENDING);
    });
  });
  describe('restore', () => {
    it('should rehydrate persisted state without raising events', () => {
      // Arrange
      const inputProps: CreateOrderProps = createInputProps();
      // Act
      const actualOrder: Order = Order.restore({
        ...inputProps,
        status: OrderStatus.CONFIRMED,
        version: 7,
        createdAt: PLACED_AT,
        updatedAt: CHANGED_AT,
      });
      // Assert
      expect(actualOrder.status).toBe(OrderStatus.CONFIRMED);
      expect(actualOrder.version).toBe(7);
      expect(actualOrder.updatedAt).toBe(CHANGED_AT);
      expect(actualOrder.domainEvents).toHaveLength(0);
    });
  });
});

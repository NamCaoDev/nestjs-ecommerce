import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../domain/aggregates/order.aggregate';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { InvalidOrderStatusTransitionError } from '../../domain/errors/invalid-order-status-transition.error';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { OrderConfirmedEvent } from '../../domain/events/order-confirmed.event';
import { OrderRepositoryPort } from '../../domain/ports/order-repository.port';
import { AddressSnapshot } from '../../domain/value-objects/address-snapshot.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { OrderCode } from '../../domain/value-objects/order-code.vo';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import { OrderStatus } from '../../domain/value-objects/order-status.vo';
import { DuplicateInboxEventError } from '../errors/duplicate-inbox-event.error';
import { InboxEntry } from '../ports/inbox-entry.type';
import { InboxPort } from '../ports/inbox.port';
import { SaveOrderWithInboxEntryInput } from '../ports/save-order-with-inbox-entry.input';
import { PaymentOutcome } from './payment-outcome.type';
import { PaymentOutcomeProcessor } from './payment-outcome-processor.service';
import { ProcessPaymentOutcomeInput } from './process-payment-outcome.input';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const ENTRY: InboxEntry = {
  eventId: 'e1',
  eventType: 'payment.succeeded',
  source: 'payment-service',
  payload: { orderId: ORDER_ID },
};

/**
 * Loads an order in the given status, as the repository would.
 */
const createStoredOrder = (status: OrderStatus): Order =>
  Order.restore({
    id: OrderId.create(ORDER_ID).getValue(),
    orderCode: OrderCode.create('ORD-000000000001').getValue(),
    customerId: '0199a7c0-0000-7000-8000-0000000000c1',
    items: [
      OrderItem.create({
        skuId: '0199a7c0-0000-7000-8000-000000000101',
        productName: 'Mug',
        quantity: 2,
        unitPrice: Money.create({ amount: 5, currency: 'USD' }).getValue(),
      }).getValue(),
    ],
    shippingAddress: AddressSnapshot.create({
      recipientName: 'A',
      phoneNumber: '+84900000000',
      line1: '1 Le Loi',
      city: 'HCMC',
      postalCode: '700000',
      countryCode: 'VN',
    }).getValue(),
    status,
    version: 1,
  });

/** Confirmation request used by most scenarios. */
const CONFIRM_INPUT: ProcessPaymentOutcomeInput = {
  entry: ENTRY,
  orderId: ORDER_ID,
  correlationId: ORDER_ID,
  targetStatus: OrderStatus.CONFIRMED,
  transition: (order: Order): Result<void, DomainError> => order.confirm(),
};

describe('PaymentOutcomeProcessor', () => {
  let mockRepository: jest.Mocked<OrderRepositoryPort>;
  let mockInbox: jest.Mocked<InboxPort>;
  let processor: PaymentOutcomeProcessor;
  beforeEach(() => {
    mockRepository = {
      findById: jest
        .fn()
        .mockResolvedValue(createStoredOrder(OrderStatus.PENDING)),
      saveWithOutbox: jest.fn(),
      updateWithOutbox: jest.fn(),
    };
    mockInbox = {
      hasProcessed: jest.fn().mockResolvedValue(false),
      saveProcessed: jest.fn().mockResolvedValue(undefined),
      saveOrderWithEntry: jest.fn().mockResolvedValue(Result.ok()),
    };
    processor = new PaymentOutcomeProcessor(mockRepository, mockInbox);
    jest
      .spyOn(processor['logger'], 'log')
      .mockImplementation((): void => undefined);
  });
  it('should move the order and save it with its outbox event and the inbox row in one call', async () => {
    // Arrange
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await processor.execute(CONFIRM_INPUT);
    // Assert
    const { order, entry }: SaveOrderWithInboxEntryInput =
      mockInbox.saveOrderWithEntry.mock.calls[0][0];
    expect(actualResult.getValue()).toBe('APPLIED');
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.domainEvents[0]).toBeInstanceOf(OrderConfirmedEvent);
    expect(entry).toBe(ENTRY);
    expect(mockInbox.saveProcessed).not.toHaveBeenCalled();
  });
  it('should skip an event already in the inbox without loading the order', async () => {
    // Arrange
    mockInbox.hasProcessed.mockResolvedValue(true);
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await processor.execute(CONFIRM_INPUT);
    // Assert
    expect(actualResult.getValue()).toBe('DUPLICATE_EVENT');
    expect(mockRepository.findById).not.toHaveBeenCalled();
    expect(mockInbox.saveOrderWithEntry).not.toHaveBeenCalled();
  });
  it('should treat a concurrent delivery that recorded the event first as a duplicate, not an error', async () => {
    // Arrange
    mockInbox.saveOrderWithEntry.mockResolvedValue(
      Result.fail(new DuplicateInboxEventError('e1')),
    );
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await processor.execute(CONFIRM_INPUT);
    // Assert
    expect(actualResult.isSuccess).toBe(true);
    expect(actualResult.getValue()).toBe('DUPLICATE_EVENT');
  });
  it('should only record the event when the order already has the target status', async () => {
    // Arrange
    mockRepository.findById.mockResolvedValue(
      createStoredOrder(OrderStatus.CONFIRMED),
    );
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await processor.execute(CONFIRM_INPUT);
    // Assert
    expect(actualResult.getValue()).toBe('ALREADY_IN_STATE');
    expect(mockInbox.saveProcessed).toHaveBeenCalledWith(ENTRY);
    expect(mockInbox.saveOrderWithEntry).not.toHaveBeenCalled();
  });
  it('should record the event and refuse a transition the order does not allow', async () => {
    // Arrange
    mockRepository.findById.mockResolvedValue(
      createStoredOrder(OrderStatus.CANCELLED),
    );
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await processor.execute(CONFIRM_INPUT);
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(
      InvalidOrderStatusTransitionError,
    );
    expect(mockInbox.saveProcessed).toHaveBeenCalledWith(ENTRY);
    expect(mockInbox.saveOrderWithEntry).not.toHaveBeenCalled();
  });
  it.each([
    { inputOrderId: 'order-1', description: 'not a UUID' },
    { inputOrderId: ORDER_ID, description: 'unknown' },
  ])('should fail when the order is $description', async ({ inputOrderId }) => {
    // Arrange
    mockRepository.findById.mockResolvedValue(undefined);
    // Act
    const actualResult: Result<PaymentOutcome, DomainError> =
      await processor.execute({ ...CONFIRM_INPUT, orderId: inputOrderId });
    // Assert
    expect(actualResult.isFailure).toBe(true);
    expect(mockInbox.saveProcessed).not.toHaveBeenCalled();
    if (inputOrderId === ORDER_ID) {
      expect(actualResult.getError()).toBeInstanceOf(OrderNotFoundError);
    }
  });
});

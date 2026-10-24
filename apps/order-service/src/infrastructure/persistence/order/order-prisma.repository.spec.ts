import { Result } from '@org/shared-domain';
import { DuplicateRequestError } from '../../../application/errors/duplicate-request.error';
import { OrderConcurrencyConflictError } from '../../../domain/errors/order-concurrency-conflict.error';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderItem } from '../../../domain/entities/order-item.entity';
import { AddressSnapshot } from '../../../domain/value-objects/address-snapshot.vo';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderCode } from '../../../domain/value-objects/order-code.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderPrismaRepository } from './order-prisma.repository';
import { OrderWithItemsRecord } from './order-with-items.record';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const IDEMPOTENCY_KEY = 'checkout-42';

/** Transaction client double exposing only the delegates the repository uses. */
interface MockTransactionClient {
  readonly order: {
    readonly create: jest.Mock;
    readonly updateMany: jest.Mock;
  };
  readonly outboxEvent: { readonly createMany: jest.Mock };
}

/**
 * Places a valid order with one pending OrderPlacedEvent.
 */
function createInputOrder(): Order {
  return Order.create({
    id: OrderId.create(ORDER_ID).getValue(),
    orderCode: OrderCode.create('ORD-000000000001').getValue(),
    customerId: '0199a7c0-0000-7000-8000-0000000000c1',
    items: [
      OrderItem.create({
        skuId: '0199a7c0-0000-7000-8000-0000000000a1',
        productName: 'Mug',
        quantity: 1,
        unitPrice: Money.create({ amount: 10, currency: 'USD' }).getValue(),
      }).getValue(),
    ],
    shippingAddress: AddressSnapshot.create({
      recipientName: 'Nguyen Van A',
      phoneNumber: '+84900000000',
      line1: '1 Le Loi',
      city: 'Ho Chi Minh City',
      postalCode: '700000',
      countryCode: 'VN',
    }).getValue(),
  }).getValue();
}

/**
 * Builds the error Prisma 7 raises through the pg adapter for a unique violation on `index`.
 */
function createMockUniqueViolation(
  index: string,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.1',
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

describe('OrderPrismaRepository', () => {
  let mockTransaction: MockTransactionClient;
  let mockPrisma: {
    readonly $transaction: jest.Mock;
    readonly order: { readonly findUnique: jest.Mock };
  };
  let repository: OrderPrismaRepository;
  beforeEach(() => {
    mockTransaction = {
      order: {
        create: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    mockPrisma = {
      $transaction: jest.fn(
        (work: (transaction: MockTransactionClient) => Promise<void>) =>
          work(mockTransaction),
      ),
      order: { findUnique: jest.fn() },
    };
    repository = new OrderPrismaRepository({
      client: mockPrisma,
    } as unknown as PrismaService);
  });
  describe('saveWithOutbox', () => {
    it('should write the order and its outbox events in one transaction, then clear the events', async () => {
      // Arrange
      const inputOrder: Order = createInputOrder();
      const expectedEventId: string = inputOrder.domainEvents[0].eventId;
      // Act
      const actualResult: Result<void, Error> = await repository.saveWithOutbox(
        {
          order: inputOrder,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
      );
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: ORDER_ID,
          orderCode: 'ORD-000000000001',
          idempotencyKey: IDEMPOTENCY_KEY,
          shippingAmount: 0,
          discountAmount: 0,
        }),
      });
      expect(mockTransaction.outboxEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            id: expectedEventId,
            eventType: 'order.placed',
          }),
        ],
      });
      expect(inputOrder.domainEvents).toHaveLength(0);
    });
    it('should return a DuplicateRequestError on an idempotency_key violation and keep the events', async () => {
      // Arrange
      const inputOrder: Order = createInputOrder();
      mockTransaction.order.create.mockRejectedValue(
        createMockUniqueViolation('orders_customer_id_idempotency_key_key'),
      );
      // Act
      const actualResult: Result<void, Error> = await repository.saveWithOutbox(
        {
          order: inputOrder,
          idempotencyKey: IDEMPOTENCY_KEY,
        },
      );
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(DuplicateRequestError);
      expect(inputOrder.domainEvents).toHaveLength(1);
    });
    it('should rethrow any other database error', async () => {
      // Arrange
      const expectedError: Prisma.PrismaClientKnownRequestError =
        createMockUniqueViolation('orders_pkey');
      mockTransaction.order.create.mockRejectedValue(expectedError);
      // Act
      const actualSave: Promise<Result<void, Error>> =
        repository.saveWithOutbox({
          order: createInputOrder(),
          idempotencyKey: IDEMPOTENCY_KEY,
        });
      // Assert
      await expect(actualSave).rejects.toBe(expectedError);
    });
  });
  describe('updateWithOutbox', () => {
    it('should update status and version guarded by the loaded version and append the outbox rows', async () => {
      // Arrange
      const inputOrder: Order = createInputOrder();
      inputOrder.clearEvents();
      inputOrder.cancel('EXPIRED_OUT_OF_STOCK');
      // Act
      await repository.updateWithOutbox(inputOrder);
      // Assert
      expect(mockTransaction.order.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, version: 1 },
        data: {
          status: 'CANCELLED',
          version: { increment: 1 },
          updatedAt: new Date(inputOrder.updatedAt),
        },
      });
      expect(mockTransaction.outboxEvent.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ eventType: 'order.cancelled' })],
      });
      expect(inputOrder.domainEvents).toHaveLength(0);
    });
    it('should throw a concurrency conflict when the stored version moved on', async () => {
      // Arrange
      const inputOrder: Order = createInputOrder();
      mockTransaction.order.updateMany.mockResolvedValue({ count: 0 });
      // Act
      const actualUpdate: Promise<void> =
        repository.updateWithOutbox(inputOrder);
      // Assert
      await expect(actualUpdate).rejects.toBeInstanceOf(
        OrderConcurrencyConflictError,
      );
      expect(mockTransaction.outboxEvent.createMany).not.toHaveBeenCalled();
      expect(inputOrder.domainEvents).toHaveLength(1);
    });
  });
  describe('findById', () => {
    it('should return undefined when the order does not exist', async () => {
      // Arrange
      mockPrisma.order.findUnique.mockResolvedValue(null);
      // Act
      const actualOrder: Order | undefined = await repository.findById(
        OrderId.create(ORDER_ID).getValue(),
      );
      // Assert
      expect(actualOrder).toBeUndefined();
    });
    it('should rehydrate the stored order with its lines', async () => {
      // Arrange
      const inputRecord: OrderWithItemsRecord = {
        id: ORDER_ID,
        orderCode: 'ORD-000000000001',
        customerId: '0199a7c0-0000-7000-8000-0000000000c1',
        idempotencyKey: IDEMPOTENCY_KEY,
        status: 'CONFIRMED',
        shippingAddress: {
          recipientName: 'Nguyen Van A',
          phoneNumber: '+84900000000',
          line1: '1 Le Loi',
          city: 'Ho Chi Minh City',
          postalCode: '700000',
          countryCode: 'VN',
        },
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('39.98'),
        shippingAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal('39.98'),
        version: 3,
        createdAt: new Date(Date.UTC(2026, 9, 24, 8)),
        updatedAt: new Date(Date.UTC(2026, 9, 24, 9)),
        items: [
          {
            id: '0199a7c0-0000-7000-8000-0000000000f1',
            orderId: ORDER_ID,
            skuId: '0199a7c0-0000-7000-8000-0000000000a1',
            productSnapshot: { name: 'Mug' },
            unitPrice: new Prisma.Decimal('19.99'),
            quantity: 2,
            lineTotal: new Prisma.Decimal('39.98'),
          },
        ],
      };
      mockPrisma.order.findUnique.mockResolvedValue(inputRecord);
      // Act
      const actualOrder: Order | undefined = await repository.findById(
        OrderId.create(ORDER_ID).getValue(),
      );
      // Assert
      expect(actualOrder?.status.value).toBe('CONFIRMED');
      expect(actualOrder?.version).toBe(3);
      expect(actualOrder?.totalAmount.amount).toBe(39.98);
      expect(actualOrder?.items[0].productName).toBe('Mug');
      expect(actualOrder?.shippingAddress.toPrimitives().countryCode).toBe(
        'VN',
      );
      expect(actualOrder?.domainEvents).toHaveLength(0);
    });
  });
});

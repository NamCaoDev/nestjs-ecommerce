import { DomainError, Result } from '@org/shared-domain';
import { DuplicateInboxEventError } from '../../../application/errors/duplicate-inbox-event.error';
import { InboxEntry } from '../../../application/ports/inbox-entry.type';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxPrismaRepository } from './inbox.prisma.repository';

const ENTRY: InboxEntry = {
  eventId: 'e1',
  eventType: 'payment.succeeded',
  source: 'payment-service',
  payload: { orderId: 'o1' },
};

/** Transaction client double exposing only the delegates the repository uses. */
interface MockTransactionClient {
  readonly inboxEvent: { readonly create: jest.Mock };
  readonly order: { readonly updateMany: jest.Mock };
  readonly outboxEvent: { readonly createMany: jest.Mock };
}

/**
 * Builds a changed order double with one pending event.
 */
const createMockOrder = (): Order =>
  ({
    id: { value: 'o1' },
    version: 2,
    status: { value: 'CONFIRMED' },
    updatedAt: 5_000,
    domainEvents: [],
    clearEvents: jest.fn(),
  }) as unknown as Order;

describe('InboxPrismaRepository', () => {
  let mockTransaction: MockTransactionClient;
  let mockClient: {
    readonly $transaction: jest.Mock;
    readonly inboxEvent: {
      readonly findUnique: jest.Mock;
      readonly createMany: jest.Mock;
    };
  };
  let repository: InboxPrismaRepository;
  beforeEach(() => {
    mockTransaction = {
      inboxEvent: { create: jest.fn().mockResolvedValue(undefined) },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    mockClient = {
      $transaction: jest.fn(
        (work: (transaction: MockTransactionClient) => Promise<void>) =>
          work(mockTransaction),
      ),
      inboxEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repository = new InboxPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  it('should report whether an event is in the inbox', async () => {
    // Arrange
    mockClient.inboxEvent.findUnique.mockResolvedValue({ id: 'e1' });
    // Act
    const actualIsProcessed: boolean = await repository.hasProcessed('e1');
    // Assert
    expect(actualIsProcessed).toBe(true);
  });
  it('should record an event alone, ignoring a duplicate', async () => {
    // Arrange
    // Act
    await repository.saveProcessed(ENTRY);
    // Assert
    expect(mockClient.inboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          id: 'e1',
          eventType: 'payment.succeeded',
          source: 'payment-service',
          payload: { orderId: 'o1' },
        },
      ],
      skipDuplicates: true,
    });
  });
  it('should write the inbox row and the order update in one transaction', async () => {
    // Arrange
    const inputOrder: Order = createMockOrder();
    // Act
    const actualResult: Result<void, DomainError> =
      await repository.saveOrderWithEntry({ order: inputOrder, entry: ENTRY });
    // Assert
    expect(actualResult.isSuccess).toBe(true);
    expect(mockClient.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction.inboxEvent.create).toHaveBeenCalled();
    expect(mockTransaction.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1', version: 2 } }),
    );
    expect(inputOrder.clearEvents).toHaveBeenCalled();
  });
  it('should report a concurrent duplicate instead of throwing, leaving the events', async () => {
    // Arrange
    const inputOrder: Order = createMockOrder();
    mockTransaction.inboxEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'inbox_events_pkey' } },
          },
        },
      }),
    );
    // Act
    const actualResult: Result<void, DomainError> =
      await repository.saveOrderWithEntry({ order: inputOrder, entry: ENTRY });
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(DuplicateInboxEventError);
    expect(mockTransaction.order.updateMany).not.toHaveBeenCalled();
    expect(inputOrder.clearEvents).not.toHaveBeenCalled();
  });
});

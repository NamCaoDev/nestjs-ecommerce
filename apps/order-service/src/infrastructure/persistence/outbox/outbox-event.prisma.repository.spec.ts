import { OutboxMessage } from '../../../application/ports/outbox-message.type';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxEventPrismaRepository } from './outbox-event.prisma.repository';

const OCCURRED_AT: Date = new Date(Date.UTC(2026, 9, 24));

describe('OutboxEventPrismaRepository', () => {
  let mockPrisma: {
    readonly $queryRaw: jest.Mock;
    readonly outboxEvent: {
      readonly findMany: jest.Mock;
      readonly updateMany: jest.Mock;
    };
  };
  let repository: OutboxEventPrismaRepository;
  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repository = new OutboxEventPrismaRepository({
      client: mockPrisma,
    } as unknown as PrismaService);
  });
  describe('claimPendingBatch', () => {
    it('should claim with FOR UPDATE SKIP LOCKED, a lease and per-aggregate ordering, and map the rows oldest first', async () => {
      // Arrange
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'e2',
          aggregate_id: 'o2',
          event_type: 'order.placed',
          payload: { orderId: 'o2' },
          occurred_at: new Date(OCCURRED_AT.getTime() + 1),
          retry_count: 0,
        },
        {
          id: 'e1',
          aggregate_id: 'o1',
          event_type: 'order.placed',
          payload: { orderId: 'o1' },
          occurred_at: OCCURRED_AT,
          retry_count: 2,
        },
      ]);
      // Act
      const actualMessages: OutboxMessage[] =
        await repository.claimPendingBatch(50);
      // Assert
      const [actualSqlParts, ...actualValues]: [string[], ...unknown[]] =
        mockPrisma.$queryRaw.mock.calls[0];
      const actualSql: string = actualSqlParts.join('?');
      expect(actualSql).toContain('FOR UPDATE SKIP LOCKED');
      expect(actualSql).toContain("SET status = 'PROCESSING'::outbox_status");
      expect(actualSql).toContain('candidate.locked_until < now()');
      expect(actualSql).toContain('NOT EXISTS');
      expect(actualValues).toEqual([60, 50]);
      expect(
        actualMessages.map((message: OutboxMessage): string => message.id),
      ).toEqual(['e1', 'e2']);
      expect(actualMessages[0]).toEqual({
        id: 'e1',
        aggregateId: 'o1',
        eventType: 'order.placed',
        payload: { orderId: 'o1' },
        occurredAt: OCCURRED_AT.getTime(),
        retryCount: 2,
      });
    });
  });
  describe('markPublished', () => {
    it('should set PUBLISHED and the publication time', async () => {
      // Arrange
      const inputPublishedAt: number = OCCURRED_AT.getTime();
      // Act
      await repository.markPublished({
        ids: ['e1', 'e2'],
        publishedAt: inputPublishedAt,
      });
      // Assert
      expect(mockPrisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1', 'e2'] } },
        data: {
          status: 'PUBLISHED',
          publishedAt: OCCURRED_AT,
          lockedUntil: null,
        },
      });
    });
  });
  describe('markFailed', () => {
    it('should return the messages to PENDING, increment the retry count and store a truncated error', async () => {
      // Arrange
      const inputError: string = 'x'.repeat(1_500);
      // Act
      await repository.markFailed({ ids: ['e1'], error: inputError });
      // Assert
      expect(mockPrisma.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1'] } },
        data: {
          status: 'PENDING',
          lockedUntil: null,
          retryCount: { increment: 1 },
          lastError: 'x'.repeat(1_000),
        },
      });
    });
  });
});

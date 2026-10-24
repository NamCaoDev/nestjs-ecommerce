import { OutboxMessage } from '../../../application/ports/outbox-message.type';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxEventPrismaRepository } from './outbox-event.prisma.repository';

const OCCURRED_AT: Date = new Date(Date.UTC(2026, 9, 24));

describe('OutboxEventPrismaRepository', () => {
  let mockClient: {
    readonly $queryRawUnsafe: jest.Mock;
    readonly $executeRawUnsafe: jest.Mock;
  };
  let repository: OutboxEventPrismaRepository;
  beforeEach(() => {
    mockClient = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    repository = new OutboxEventPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  describe('claimPendingBatch', () => {
    it('should claim with the shared SKIP LOCKED statement, a 60 s lease, and map rows oldest first', async () => {
      // Arrange
      mockClient.$queryRawUnsafe.mockResolvedValue([
        {
          id: 'e2',
          aggregate_id: 'o2',
          event_type: 'order.placed',
          payload: {},
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
      const [actualSql, ...actualValues]: [string, ...unknown[]] =
        mockClient.$queryRawUnsafe.mock.calls[0];
      expect(actualSql).toContain('FOR UPDATE SKIP LOCKED');
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
    it('should mark the ids PUBLISHED and clear the lease', async () => {
      // Arrange
      const inputIds: string[] = ['e1', 'e2'];
      // Act
      await repository.markPublished({
        ids: inputIds,
        publishedAt: OCCURRED_AT.getTime(),
      });
      // Assert
      const [actualSql, actualIds, actualPublishedAt]: [
        string,
        string[],
        Date,
      ] = mockClient.$executeRawUnsafe.mock.calls[0];
      expect(actualSql).toContain("status = 'PUBLISHED'");
      expect(actualSql).toContain('locked_until = NULL');
      expect(actualIds).toEqual(inputIds);
      expect(actualPublishedAt).toEqual(OCCURRED_AT);
    });
  });
  describe('markFailed', () => {
    it('should return the ids to PENDING, count the attempt and truncate the error', async () => {
      // Arrange
      const inputError: string = 'x'.repeat(1_500);
      // Act
      await repository.markFailed({ ids: ['e1'], error: inputError });
      // Assert
      const [actualSql, actualIds, actualError]: [string, string[], string] =
        mockClient.$executeRawUnsafe.mock.calls[0];
      expect(actualSql).toContain("status = 'PENDING'");
      expect(actualSql).toContain('retry_count = retry_count + 1');
      expect(actualIds).toEqual(['e1']);
      expect(actualError).toHaveLength(1_000);
    });
  });
});

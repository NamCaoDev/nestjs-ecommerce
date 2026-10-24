import { EventPublisherPort } from '../../ports/event-publisher.port';
import { OutboxEventRepositoryPort } from '../../ports/outbox-event-repository.port';
import { OutboxMessage } from '../../ports/outbox-message.type';
import { RelayOutboxCommand } from './relay-outbox.command';
import { RelayOutboxHandler } from './relay-outbox.handler';
import { RelayOutboxOutput } from './relay-outbox.output';

/**
 * Builds a pending outbox message.
 */
const createMockMessage = (
  id: string,
  retryCount: number = 0,
): OutboxMessage => ({
  id,
  aggregateId: '0199a7c0-0000-7000-8000-000000000001',
  eventType: 'payment.succeeded',
  payload: { orderId: '0199a7c0-0000-7000-8000-000000000001' },
  occurredAt: Date.UTC(2026, 9, 24),
  retryCount,
});

describe('RelayOutboxHandler', () => {
  let mockRepository: jest.Mocked<OutboxEventRepositoryPort>;
  let mockPublisher: jest.Mocked<EventPublisherPort>;
  let handler: RelayOutboxHandler;
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.UTC(2026, 9, 24, 12) });
    mockRepository = {
      claimPendingBatch: jest.fn().mockResolvedValue([]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    mockPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    handler = new RelayOutboxHandler(mockRepository, mockPublisher);
    jest
      .spyOn(handler['logger'], 'warn')
      .mockImplementation((): void => undefined);
    jest
      .spyOn(handler['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  describe('execute', () => {
    it('should publish the pending batch in order and mark it PUBLISHED', async () => {
      // Arrange
      const inputMessages: OutboxMessage[] = [
        createMockMessage('e1'),
        createMockMessage('e2'),
      ];
      mockRepository.claimPendingBatch.mockResolvedValue(inputMessages);
      // Act
      const actualOutput: RelayOutboxOutput = await handler.execute(
        new RelayOutboxCommand({ batchSize: 50 }),
      );
      // Assert
      expect(actualOutput).toEqual({ publishedCount: 2, failedCount: 0 });
      expect(mockRepository.claimPendingBatch).toHaveBeenCalledWith(50);
      expect(mockPublisher.publish).toHaveBeenCalledWith(inputMessages);
      expect(mockRepository.markPublished).toHaveBeenCalledWith({
        ids: ['e1', 'e2'],
        publishedAt: Date.UTC(2026, 9, 24, 12),
      });
    });
    it('should do nothing when the outbox is empty', async () => {
      // Arrange
      mockRepository.claimPendingBatch.mockResolvedValue([]);
      // Act
      const actualOutput: RelayOutboxOutput = await handler.execute(
        new RelayOutboxCommand({ batchSize: 50 }),
      );
      // Assert
      expect(actualOutput).toEqual({ publishedCount: 0, failedCount: 0 });
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });
    it('should keep a failed batch PENDING, count the attempt and warn', async () => {
      // Arrange
      mockRepository.claimPendingBatch.mockResolvedValue([
        createMockMessage('e1'),
      ]);
      mockPublisher.publish.mockRejectedValue(new Error('broker unreachable'));
      // Act
      const actualOutput: RelayOutboxOutput = await handler.execute(
        new RelayOutboxCommand({ batchSize: 50 }),
      );
      // Assert
      expect(actualOutput).toEqual({ publishedCount: 0, failedCount: 1 });
      expect(mockRepository.markFailed).toHaveBeenCalledWith({
        ids: ['e1'],
        error: 'broker unreachable',
      });
      expect(mockRepository.markPublished).not.toHaveBeenCalled();
      expect(handler['logger'].warn).toHaveBeenCalledTimes(1);
      expect(handler['logger'].error).not.toHaveBeenCalled();
    });
    it('should log an error once a batch reaches the retry threshold', async () => {
      // Arrange
      mockRepository.claimPendingBatch.mockResolvedValue([
        createMockMessage('e1', 4),
      ]);
      mockPublisher.publish.mockRejectedValue(new Error('broker unreachable'));
      // Act
      await handler.execute(new RelayOutboxCommand({ batchSize: 50 }));
      // Assert
      expect(handler['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('after 5 attempt(s)'),
      );
    });
  });
});

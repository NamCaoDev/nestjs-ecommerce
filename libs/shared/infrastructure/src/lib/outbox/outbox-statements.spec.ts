import { claimOutboxBatch } from './claim-outbox-batch.util';
import { ClaimedOutboxRecord } from './claimed-outbox-record.type';
import { markOutboxFailed } from './mark-outbox-failed.util';
import { markOutboxPublished } from './mark-outbox-published.util';
import { OutboxSqlClient } from './outbox-sql-client.interface';

describe('shared outbox statements', () => {
  let mockClient: {
    readonly $queryRawUnsafe: jest.Mock;
    readonly $executeRawUnsafe: jest.Mock;
  };
  beforeEach(() => {
    mockClient = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
  });
  it('should claim with SKIP LOCKED and a lease, parameterised, and map rows oldest first', async () => {
    // Arrange
    mockClient.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'b',
        aggregate_id: 'x',
        event_type: 't',
        payload: {},
        occurred_at: new Date(2),
        retry_count: 0,
      },
      {
        id: 'a',
        aggregate_id: 'y',
        event_type: 't',
        payload: { k: 1 },
        occurred_at: new Date(1),
        retry_count: 3,
      },
    ]);
    // Act
    const actualRecords: ClaimedOutboxRecord[] = await claimOutboxBatch({
      client: mockClient as unknown as OutboxSqlClient,
      limit: 50,
      leaseSeconds: 60,
    });
    // Assert
    const [actualSql, ...actualValues]: [string, ...unknown[]] =
      mockClient.$queryRawUnsafe.mock.calls[0];
    expect(actualSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(actualSql).toContain('make_interval(secs => $1)');
    expect(actualValues).toEqual([60, 50]);
    expect(actualRecords[0]).toEqual({
      id: 'a',
      aggregateId: 'y',
      eventType: 't',
      payload: { k: 1 },
      occurredAt: 1,
      retryCount: 3,
    });
  });
  it('should skip the update statements for an empty id list', async () => {
    // Arrange
    const inputClient: OutboxSqlClient =
      mockClient as unknown as OutboxSqlClient;
    // Act
    await markOutboxPublished({ client: inputClient, ids: [], publishedAt: 1 });
    await markOutboxFailed({ client: inputClient, ids: [], error: 'x' });
    // Assert
    expect(mockClient.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

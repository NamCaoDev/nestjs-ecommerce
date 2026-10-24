import { OutboxSqlClient } from './outbox-sql-client.interface';

/**
 * Input of {@link markOutboxPublished}.
 */
export interface MarkOutboxPublishedInput {
  readonly client: OutboxSqlClient;
  readonly ids: readonly string[];
  /** Epoch milliseconds. */
  readonly publishedAt: number;
}

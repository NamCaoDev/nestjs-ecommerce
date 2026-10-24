import { OutboxSqlClient } from './outbox-sql-client.interface';

/**
 * Input of {@link markOutboxFailed}.
 */
export interface MarkOutboxFailedInput {
  readonly client: OutboxSqlClient;
  readonly ids: readonly string[];
  /** Reason of the failed attempt, stored (truncated) for diagnosis. */
  readonly error: string;
}

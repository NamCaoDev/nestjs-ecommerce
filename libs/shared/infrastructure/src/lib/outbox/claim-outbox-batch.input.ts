import { OutboxSqlClient } from './outbox-sql-client.interface';

/**
 * Input of {@link claimOutboxBatch}.
 */
export interface ClaimOutboxBatchInput {
  readonly client: OutboxSqlClient;
  /** Maximum number of rows claimed. */
  readonly limit: number;
  /** How long the claim is held; a relay that crashes loses its claim after this lease. */
  readonly leaseSeconds: number;
}

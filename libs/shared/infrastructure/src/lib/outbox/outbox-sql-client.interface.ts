/**
 * Raw-SQL surface of a generated Prisma client, enough to run the shared outbox statements against
 * any service's `outbox_events` table.
 */
export interface OutboxSqlClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Creates the Prisma 7 PostgreSQL driver adapter. The adapter owns a `pg` connection pool,
 * which is released when the Prisma client disconnects.
 *
 * @param databaseUrl - PostgreSQL connection string.
 * @returns The driver adapter to pass to a generated `PrismaClient`.
 */
export function createPgDriverAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl });
}

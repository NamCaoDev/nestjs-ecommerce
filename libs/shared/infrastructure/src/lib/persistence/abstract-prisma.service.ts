import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readEnv } from '../env/read-env.util';
import { AbstractPrismaServiceProps } from './abstract-prisma-service.props';
import { createPgDriverAdapter } from './create-pg-driver-adapter.factory';
import { DatabaseConnectionError } from './database-connection.error';
import { PrismaClientLike } from './prisma-client-like.interface';

/** Cheapest statement proving the database is reachable. */
const CONNECTION_PROBE_QUERY = 'SELECT 1';

/**
 * Base of each service's Prisma service. Builds the generated client on the `pg` driver adapter from
 * the required `DATABASE_URL`, verifies the connection at startup (the pool is lazy, so `$connect`
 * alone proves nothing) and releases the pool on shutdown.
 *
 * Generated clients differ per service, so the client is composed (`prisma.client.order...`)
 * rather than inherited.
 *
 * @typeParam TClient - Generated `PrismaClient` of the service.
 */
export abstract class AbstractPrismaService<TClient extends PrismaClientLike>
  implements OnModuleInit, OnModuleDestroy
{
  /** Generated Prisma client of the service. */
  public readonly client: TClient;
  private readonly serviceName: string;

  /**
   * @param props - Service name and client factory.
   * @throws {MissingEnvironmentVariableError} When `DATABASE_URL` is not set.
   */
  protected constructor({
    serviceName,
    createClient,
  }: AbstractPrismaServiceProps<TClient>) {
    this.serviceName = serviceName;
    this.client = createClient(
      createPgDriverAdapter(readEnv({ name: 'DATABASE_URL' })),
    );
  }

  /**
   * Connects and runs a probe query so an unreachable database fails the startup with context.
   *
   * @throws {DatabaseConnectionError} When the database cannot be reached.
   */
  public async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      await this.client.$executeRawUnsafe(CONNECTION_PROBE_QUERY);
    } catch (err: unknown) {
      throw new DatabaseConnectionError({
        serviceName: this.serviceName,
        cause: err,
      });
    }
  }

  /**
   * Disconnects the client, which closes the driver adapter's connection pool.
   */
  public async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

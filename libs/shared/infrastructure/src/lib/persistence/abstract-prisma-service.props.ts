import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClientLike } from './prisma-client-like.interface';

/**
 * Constructor input of {@link AbstractPrismaService}.
 *
 * @typeParam TClient - Generated `PrismaClient` of the service.
 */
export interface AbstractPrismaServiceProps<TClient extends PrismaClientLike> {
  /** Service name used in connection errors, e.g. `order-service`. */
  readonly serviceName: string;
  /** Builds the generated client around the shared driver adapter. */
  readonly createClient: (adapter: PrismaPg) => TClient;
}

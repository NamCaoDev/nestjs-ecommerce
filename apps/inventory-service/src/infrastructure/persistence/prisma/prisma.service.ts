import { Injectable } from '@nestjs/common';
import { AbstractPrismaService } from '@org/shared-infrastructure';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

/**
 * Prisma access to `inventory_db` (`DATABASE_URL`), bound to the Nest lifecycle by
 * {@link AbstractPrismaService}. Use `prisma.client` for queries.
 */
@Injectable()
export class PrismaService extends AbstractPrismaService<PrismaClient> {
  /**
   * Creates the generated client on the shared `pg` driver adapter.
   */
  public constructor() {
    super({
      serviceName: 'inventory-service',
      createClient: (adapter: PrismaPg): PrismaClient =>
        new PrismaClient({ adapter }),
    });
  }
}

import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Provides the shared {@link PrismaService} for `order_db`.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

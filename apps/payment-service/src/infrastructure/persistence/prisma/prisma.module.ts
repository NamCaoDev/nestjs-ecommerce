import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Provides the shared {@link PrismaService} for `payment_db`.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

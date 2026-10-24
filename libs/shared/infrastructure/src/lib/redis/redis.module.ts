import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Provides the shared {@link RedisService}.
 */
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

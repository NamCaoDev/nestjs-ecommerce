import { Module } from '@nestjs/common';
import { IDEMPOTENCY_PORT } from '../../application/ports/idempotency.token';
import { RedisModule } from '@org/shared-infrastructure';
import { RedisIdempotencyAdapter } from './redis-idempotency.adapter';

/**
 * Binds {@link IDEMPOTENCY_PORT} to the Redis adapter.
 */
@Module({
  imports: [RedisModule],
  providers: [{ provide: IDEMPOTENCY_PORT, useClass: RedisIdempotencyAdapter }],
  exports: [IDEMPOTENCY_PORT],
})
export class IdempotencyModule {}

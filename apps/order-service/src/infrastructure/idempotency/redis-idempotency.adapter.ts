import { Injectable } from '@nestjs/common';
import { Result } from '@org/shared-domain';
import { DuplicateRequestError } from '../../application/errors/duplicate-request.error';
import { AcquireLockInput } from '../../application/ports/acquire-lock.input';
import { IdempotencyPort } from '../../application/ports/idempotency.port';
import { MarkCompletedInput } from '../../application/ports/mark-completed.input';
import { ReleaseLockInput } from '../../application/ports/release-lock.input';
import { RedisService } from '@org/shared-infrastructure';

/** Namespace of order Idempotency-Keys in the shared Redis: `idempotency:order:{customerId}:{key}`. */
const KEY_PREFIX = 'idempotency:order';

/** Value of a key whose request is in flight. */
const PROCESSING_STATE = 'PROCESSING';

/** Value of a key whose request has succeeded. */
const COMPLETED_STATE = 'COMPLETED';

/** Reply of a successful `SET`. */
const REDIS_OK_REPLY = 'OK';

/**
 * Deletes the key only while it is still `PROCESSING`, atomically, so a late failure
 * can never erase a `COMPLETED` marker.
 */
const RELEASE_IF_PROCESSING_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

/**
 * Redis implementation of {@link IdempotencyPort}:
 * `SET key PROCESSING NX EX <ttl>` → `SET key COMPLETED EX <ttl>`, or a guarded delete on failure.
 */
@Injectable()
export class RedisIdempotencyAdapter implements IdempotencyPort {
  /**
   * @param redis - Shared Redis client.
   */
  public constructor(private readonly redis: RedisService) {}

  /**
   * @param input - Key and processing time-to-live.
   * @returns Success, or a {@link DuplicateRequestError} when the key already exists.
   */
  public async acquireLock({
    customerId,
    key,
    ttlSeconds,
  }: AcquireLockInput): Promise<Result<void, DuplicateRequestError>> {
    const reply: string | null = await this.redis.set(
      RedisIdempotencyAdapter.toRedisKey({ customerId, key }),
      PROCESSING_STATE,
      'EX',
      ttlSeconds,
      'NX',
    );
    if (reply !== REDIS_OK_REPLY) {
      return Result.fail(new DuplicateRequestError(key));
    }
    return Result.ok();
  }

  /**
   * @param input - Key and completion time-to-live.
   */
  public async markCompleted({
    customerId,
    key,
    ttlSeconds,
  }: MarkCompletedInput): Promise<void> {
    await this.redis.set(
      RedisIdempotencyAdapter.toRedisKey({ customerId, key }),
      COMPLETED_STATE,
      'EX',
      ttlSeconds,
    );
  }

  /**
   * @param input - Customer and key to release; ignored unless the key is still `PROCESSING`.
   */
  public async releaseLock(input: ReleaseLockInput): Promise<void> {
    await this.redis.eval(
      RELEASE_IF_PROCESSING_SCRIPT,
      1,
      RedisIdempotencyAdapter.toRedisKey(input),
      PROCESSING_STATE,
    );
  }

  /**
   * @returns The namespaced Redis key.
   */
  private static toRedisKey({ customerId, key }: ReleaseLockInput): string {
    return `${KEY_PREFIX}:${customerId}:${key}`;
  }
}

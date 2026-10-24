import { Result } from '@org/shared-domain';
import { DuplicateRequestError } from '../errors/duplicate-request.error';
import { AcquireLockInput } from './acquire-lock.input';
import { MarkCompletedInput } from './mark-completed.input';
import { ReleaseLockInput } from './release-lock.input';

/**
 * Outbound port guarding state-changing requests by Idempotency-Key, scoped per customer (CLAUDE.md §4.3).
 * A key moves `PROCESSING` (short TTL) → `COMPLETED` (long TTL), or is released on failure.
 * Injected with {@link IDEMPOTENCY_PORT}.
 */
export interface IdempotencyPort {
  /**
   * Marks the key as `PROCESSING` for `ttlSeconds` if nobody holds it (`SET NX EX`).
   *
   * @param input - Key and processing time-to-live.
   * @returns Success, or a {@link DuplicateRequestError} when the key is processing or completed.
   */
  acquireLock(
    input: AcquireLockInput,
  ): Promise<Result<void, DuplicateRequestError>>;

  /**
   * Marks the key as `COMPLETED` so later retries are rejected for `ttlSeconds`.
   *
   * @param input - Key and completion time-to-live.
   */
  markCompleted(input: MarkCompletedInput): Promise<void>;

  /**
   * Frees the key so the client can retry, e.g. after a failed attempt.
   *
   * @param input - Customer and key to release.
   */
  releaseLock(input: ReleaseLockInput): Promise<void>;
}

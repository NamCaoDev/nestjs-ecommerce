import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { readEnv } from '../env/read-env.util';

/** Connection string used when `REDIS_URL` is not set. */
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/** Fail a command after this many reconnection attempts instead of queueing it forever. */
const MAX_RETRIES_PER_REQUEST = 3;

/**
 * Shared `ioredis` client configured from `REDIS_URL` (e.g. `redis://:password@localhost:6379`).
 * Injected by class; closes gracefully on shutdown.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  /**
   * Connects to `REDIS_URL`.
   */
  public constructor() {
    super(readEnv({ name: 'REDIS_URL', defaultValue: DEFAULT_REDIS_URL }), {
      maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
    });
  }

  /**
   * Sends `QUIT` so pending replies are flushed; falls back to closing the socket when the
   * connection is already broken.
   */
  public async onModuleDestroy(): Promise<void> {
    await this.quit().catch((): void => {
      this.disconnect();
    });
  }
}

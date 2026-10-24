import { readEnv } from '@org/shared-infrastructure';
import { ConsumerRetryPolicy } from './consumer-retry-policy.type';

/** Attempts used when `KAFKA_CONSUMER_MAX_ATTEMPTS` is not set. */
const DEFAULT_MAX_ATTEMPTS = '5';

/** First backoff used when `KAFKA_CONSUMER_RETRY_BACKOFF_MS` is not set. */
const DEFAULT_INITIAL_BACKOFF_MS = '200';

/**
 * @returns The retry policy configured by the environment.
 */
export function readConsumerRetryPolicy(): ConsumerRetryPolicy {
  return {
    maxAttempts: Math.max(
      1,
      Number(
        readEnv({
          name: 'KAFKA_CONSUMER_MAX_ATTEMPTS',
          defaultValue: DEFAULT_MAX_ATTEMPTS,
        }),
      ),
    ),
    initialBackoffMs: Number(
      readEnv({
        name: 'KAFKA_CONSUMER_RETRY_BACKOFF_MS',
        defaultValue: DEFAULT_INITIAL_BACKOFF_MS,
      }),
    ),
  };
}

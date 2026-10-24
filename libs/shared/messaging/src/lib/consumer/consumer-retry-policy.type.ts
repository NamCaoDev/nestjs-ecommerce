/**
 * How a consumer retries a failing message before parking it in the dead-letter topic.
 */
export interface ConsumerRetryPolicy {
  /** Attempts before the message goes to the dead-letter topic (`KAFKA_CONSUMER_MAX_ATTEMPTS`). */
  readonly maxAttempts: number;
  /** Pause before the second attempt, doubled each time (`KAFKA_CONSUMER_RETRY_BACKOFF_MS`). */
  readonly initialBackoffMs: number;
}

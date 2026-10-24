/**
 * Value of a message parked in a dead-letter topic (`<topic>.dlq`).
 */
export interface DeadLetterRecord {
  readonly originalTopic: string;
  readonly partition: number;
  readonly offset: string;
  readonly eventId?: string;
  readonly correlationId?: string;
  /** `MALFORMED` for an undecodable message, `RETRIES_EXHAUSTED` otherwise. */
  readonly reason: 'MALFORMED' | 'RETRIES_EXHAUSTED';
  readonly error?: string;
  readonly attempts: number;
  /** Epoch milliseconds. */
  readonly failedAt: number;
  /** Original value, UTF-8. */
  readonly originalValue: string | null;
}

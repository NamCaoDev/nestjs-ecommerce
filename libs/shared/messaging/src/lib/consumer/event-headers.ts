/**
 * Kafka headers set by the producers of integration events.
 */
export const EVENT_HEADERS = {
  EVENT_ID: 'event-id',
  EVENT_TYPE: 'event-type',
  CORRELATION_ID: 'x-correlation-id',
  DEAD_LETTER_REASON: 'x-dead-letter-reason',
} as const;

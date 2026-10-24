/**
 * Event type names published on {@link PAYMENTS_EVENTS_TOPIC}.
 */
export const PAYMENT_EVENT_TYPES = {
  SUCCEEDED: 'payment.succeeded',
  FAILED: 'payment.failed',
} as const;

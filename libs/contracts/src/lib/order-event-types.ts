/**
 * Event type names published on {@link ORDERS_EVENTS_TOPIC}.
 */
export const ORDER_EVENT_TYPES = {
  PLACED: 'order.placed',
  CONFIRMED: 'order.confirmed',
  CANCELLED: 'order.cancelled',
} as const;

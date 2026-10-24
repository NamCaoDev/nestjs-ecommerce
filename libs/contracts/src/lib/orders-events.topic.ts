/**
 * Kafka topic carrying the integration events of the order service, keyed by `orderId`
 * so all events of one order stay ordered within a partition.
 */
export const ORDERS_EVENTS_TOPIC = 'orders.events';

/**
 * Partition count of {@link ORDERS_EVENTS_TOPIC}. Producers and consumers both ensure the topic
 * exists with this count before using it, so broker auto-creation (1 partition) never wins.
 */
export const ORDERS_EVENTS_PARTITIONS = 3;

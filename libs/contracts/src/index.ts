/**
 * Public API of the contracts library: integration event payloads shared between services.
 * Pure TypeScript, no framework dependencies.
 */
export * from './lib/order-placed.payload';
export * from './lib/order-confirmed.payload';
export * from './lib/order-cancelled.payload';
export * from './lib/orders-events.topic';
export * from './lib/order-event-types';
export * from './lib/integration-event.envelope';
export * from './lib/orders-events.partitions';
export * from './lib/inventory-events.topic';
export * from './lib/inventory-events.partitions';
export * from './lib/inventory-event-types';
export * from './lib/stock-reservation-failed.payload';
export * from './lib/stock-reservation-failure-reasons';

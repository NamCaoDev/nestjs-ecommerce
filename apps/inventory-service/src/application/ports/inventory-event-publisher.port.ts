import { IntegrationEventEnvelope } from '@org/contracts';

/**
 * Outbound port publishing inventory integration events on `inventory.events`.
 * Injected with {@link INVENTORY_EVENT_PUBLISHER_PORT}.
 */
export interface InventoryEventPublisherPort {
  /**
   * @param event - Envelope to publish, keyed by its aggregate id.
   * @throws When the broker is unreachable or rejects the event.
   */
  publish(event: IntegrationEventEnvelope<object>): Promise<void>;
}

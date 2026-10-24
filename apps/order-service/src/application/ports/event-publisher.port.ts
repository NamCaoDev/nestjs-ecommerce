import { OutboxMessage } from './outbox-message.type';

/**
 * Outbound port to the message broker. Injected with {@link EVENT_PUBLISHER_PORT}.
 */
export interface EventPublisherPort {
  /**
   * Publishes the messages in order, all or none acknowledged.
   *
   * @param messages - Outbox messages to publish.
   * @throws When the broker is unreachable or rejects the batch.
   */
  publish(messages: readonly OutboxMessage[]): Promise<void>;
}

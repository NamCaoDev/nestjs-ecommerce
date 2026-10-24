import { TopicDefinition } from '../topics/topic-definition.type';

/**
 * Topic a consumer reads and the consumer group it belongs to.
 */
export interface KafkaSubscription extends TopicDefinition {
  /** Consumer group shared by every instance of the service. */
  readonly groupId: string;
}

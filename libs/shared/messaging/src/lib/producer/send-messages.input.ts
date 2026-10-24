import type { Message } from 'kafkajs';
import { TopicDefinition } from '../topics/topic-definition.type';

/**
 * Input of {@link KafkaProducerService.send}.
 */
export interface SendMessagesInput extends TopicDefinition {
  /** Messages published in order; give them a key to keep per-key ordering. */
  readonly messages: readonly Message[];
}

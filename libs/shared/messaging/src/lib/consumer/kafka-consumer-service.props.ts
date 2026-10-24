import type { Kafka } from 'kafkajs';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { KafkaSubscription } from './kafka-subscription.type';

/**
 * Constructor input of {@link KafkaConsumerService}.
 */
export interface KafkaConsumerServiceProps {
  readonly kafka: Kafka;
  readonly topicManager: KafkaTopicManager;
  readonly subscription: KafkaSubscription;
}

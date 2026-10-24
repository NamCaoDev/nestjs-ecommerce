import type { Kafka } from 'kafkajs';
import { KafkaProducerService } from '../producer/kafka-producer.service';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { KafkaSubscription } from './kafka-subscription.type';

/**
 * Constructor input of {@link KafkaConsumerService}.
 */
export interface KafkaConsumerServiceProps {
  readonly kafka: Kafka;
  readonly topicManager: KafkaTopicManager;
  /** Publishes messages that cannot be processed to the dead-letter topic. */
  readonly producer: KafkaProducerService;
  readonly subscription: KafkaSubscription;
}

/**
 * Public API of the shared messaging library: Kafka client (with Snappy), topic provisioning,
 * idempotent producer and the base integration-event consumer.
 */
export * from './lib/client/kafka-client.token';
export * from './lib/client/kafka-module.options';
export * from './lib/client/register-snappy-codec.util';
export * from './lib/client/create-kafka-client.factory';
export * from './lib/topics/topic-definition.type';
export * from './lib/topics/kafka-topic.manager';
export * from './lib/producer/send-messages.input';
export * from './lib/producer/kafka-producer.service';
export * from './lib/consumer/kafka-subscription.type';
export * from './lib/consumer/kafka-consumer-service.props';
export * from './lib/consumer/parse-event-envelope.util';
export * from './lib/consumer/kafka-consumer.service';
export * from './lib/kafka.module';

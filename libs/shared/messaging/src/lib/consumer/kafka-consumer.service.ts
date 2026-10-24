import {
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { IntegrationEventEnvelope } from '@org/contracts';
import { readBooleanEnv } from '@org/shared-infrastructure';
import type { Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaSubscription } from './kafka-subscription.type';
import { KafkaConsumerServiceProps } from './kafka-consumer-service.props';
import { parseEventEnvelope } from './parse-event-envelope.util';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';

/**
 * Base of every integration-event consumer. It joins the consumer group (without auto-creating
 * topics), ensures the topic, and decodes each message into an envelope for
 * {@link KafkaConsumerService.handleEnvelope}. Malformed messages are logged and skipped; an error
 * thrown by the handler is rethrown so Kafka redelivers the message (handlers must be idempotent).
 * Consumption starts in the background so HTTP and gRPC servers are not blocked by Kafka.
 */
export abstract class KafkaConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  protected readonly logger: Logger;
  private readonly consumer: Consumer;
  private readonly topicManager: KafkaTopicManager;
  private readonly subscription: KafkaSubscription;

  /**
   * @param props - Kafka client, topic manager and subscription.
   */
  protected constructor({
    kafka,
    topicManager,
    subscription,
  }: KafkaConsumerServiceProps) {
    this.logger = new Logger(new.target.name);
    this.topicManager = topicManager;
    this.subscription = subscription;
    this.consumer = kafka.consumer({
      groupId: subscription.groupId,
      allowAutoTopicCreation: false,
    });
  }

  /**
   * Starts consuming in the background, unless `KAFKA_CONSUMERS_ENABLED=false` (e.g. an API-only deployment).
   */
  public onApplicationBootstrap(): void {
    if (
      !readBooleanEnv({ name: 'KAFKA_CONSUMERS_ENABLED', defaultValue: true })
    ) {
      this.logger.log(
        `Disabled by KAFKA_CONSUMERS_ENABLED; not consuming ${this.subscription.topic}`,
      );
      return;
    }
    this.executeStart().catch((err: unknown): void => {
      this.logger.error(
        `Kafka consumer failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Leaves the consumer group so partitions are reassigned promptly.
   */
  public async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  /**
   * Decodes one message and hands it to {@link handleEnvelope}.
   *
   * @param payload - Kafka message and its partition context.
   */
  public async handleMessage({ message }: EachMessagePayload): Promise<void> {
    const envelope:
      IntegrationEventEnvelope<Record<string, unknown>> | undefined =
      parseEventEnvelope(message.value);
    if (envelope === undefined) {
      this.logger.warn(
        `Skipping malformed message at offset ${message.offset}`,
      );
      return;
    }
    await this.handleEnvelope(envelope);
  }

  /**
   * Handles one decoded integration event.
   *
   * @param envelope - Decoded event.
   */
  protected abstract handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
  ): Promise<void>;

  /**
   * Ensures the topic, then connects, subscribes and starts the consumption loop.
   */
  private async executeStart(): Promise<void> {
    const { topic, numPartitions, groupId }: KafkaSubscription =
      this.subscription;
    await this.topicManager.ensureTopic({ topic, numPartitions });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: (payload: EachMessagePayload): Promise<void> =>
        this.handleMessage(payload),
    });
    this.logger.log(`Consuming ${topic} as ${groupId}`);
  }
}

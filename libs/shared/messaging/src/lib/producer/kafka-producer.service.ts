import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { CompressionTypes } from 'kafkajs';
import type { Kafka, Producer } from 'kafkajs';
import { KAFKA_CLIENT } from '../client/kafka-client.token';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { SendMessagesInput } from './send-messages.input';

/** Wait for every in-sync replica before acknowledging (required by the idempotent producer). */
const ACKS_ALL = -1;

/**
 * Shared producer: idempotent with one in-flight request (per-key order, no broker-side duplicates
 * on retries), `acks=all`, Snappy compression. Connects lazily so a service starts while the broker
 * is down, and ensures the target topic before the first send.
 */
@Injectable()
export class KafkaProducerService implements OnModuleDestroy {
  private readonly producer: Producer;
  private connection: Promise<void> | undefined;

  /**
   * @param kafka - Shared Kafka client.
   * @param topicManager - Topic provisioning.
   */
  public constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    private readonly topicManager: KafkaTopicManager,
  ) {
    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
    });
  }

  /**
   * @param input - Topic, its partition count and the messages.
   * @throws When the broker is unreachable or rejects the batch.
   */
  public async send({
    topic,
    numPartitions,
    messages,
  }: SendMessagesInput): Promise<void> {
    await this.ensureConnected();
    await this.topicManager.ensureTopic({ topic, numPartitions });
    await this.producer.send({
      topic,
      acks: ACKS_ALL,
      compression: CompressionTypes.Snappy,
      messages: [...messages],
    });
  }

  /**
   * Flushes and closes the producer on shutdown.
   */
  public async onModuleDestroy(): Promise<void> {
    if (this.connection !== undefined) {
      await this.producer.disconnect();
    }
  }

  /**
   * Connects once; a failed attempt is forgotten so the next send retries it.
   */
  private ensureConnected(): Promise<void> {
    this.connection ??= this.producer
      .connect()
      .catch((err: unknown): Promise<never> => {
        this.connection = undefined;
        return Promise.reject(err);
      });
    return this.connection;
  }
}

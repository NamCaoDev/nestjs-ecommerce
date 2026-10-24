import { Inject, Injectable } from '@nestjs/common';
import type { Admin, Kafka } from 'kafkajs';
import { KAFKA_CLIENT } from '../client/kafka-client.token';
import { TopicDefinition } from './topic-definition.type';

/**
 * Makes sure topics exist with their partition count before they are produced to or consumed from,
 * so broker auto-creation (one partition) never wins. Each topic is checked once per process,
 * checks run one at a time on the shared admin client, and a failed check is retried on the next call.
 */
@Injectable()
export class KafkaTopicManager {
  private readonly admin: Admin;
  private readonly ensuredTopics: Map<string, Promise<void>> = new Map();
  private adminQueue: Promise<void> = Promise.resolve();

  /**
   * @param kafka - Shared Kafka client.
   */
  public constructor(@Inject(KAFKA_CLIENT) kafka: Kafka) {
    this.admin = kafka.admin();
  }

  /**
   * @param definition - Topic and partition count.
   */
  public ensureTopic(definition: TopicDefinition): Promise<void> {
    const pending: Promise<void> =
      this.ensuredTopics.get(definition.topic) ??
      this.enqueueEnsure(definition).catch((err: unknown): Promise<never> => {
        this.ensuredTopics.delete(definition.topic);
        return Promise.reject(err);
      });
    this.ensuredTopics.set(definition.topic, pending);
    return pending;
  }

  /**
   * Runs admin work one topic at a time: the admin client is shared, so a concurrent
   * `disconnect` would cut another topic's check short.
   */
  private enqueueEnsure(definition: TopicDefinition): Promise<void> {
    const run: Promise<void> = this.adminQueue.then((): Promise<void> =>
      this.executeEnsure(definition),
    );
    this.adminQueue = run.catch((): void => undefined);
    return run;
  }

  /**
   * Creates the topic when missing. Existence is checked first because kafkajs logs an error when
   * asked to create an existing topic.
   */
  private async executeEnsure({
    topic,
    numPartitions,
  }: TopicDefinition): Promise<void> {
    await this.admin.connect();
    try {
      const existingTopics: string[] = await this.admin.listTopics();
      if (!existingTopics.includes(topic)) {
        await this.admin.createTopics({
          topics: [{ topic, numPartitions }],
          waitForLeaders: true,
        });
      }
    } finally {
      await this.admin.disconnect();
    }
  }
}

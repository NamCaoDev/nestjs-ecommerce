import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Admin, Kafka } from 'kafkajs';
import { KAFKA_CLIENT } from '../client/kafka-client.token';
import { TopicDefinition } from './topic-definition.type';

/**
 * Makes sure topics exist with their partition count before they are produced to or consumed from,
 * so broker auto-creation (one partition) never wins. Each topic is checked once per process, checks
 * run one at a time, and a failed check is retried on the next call.
 *
 * The admin client connects once and stays connected until shutdown: reconnecting it right after a
 * `disconnect` reuses a socket that is still closing and fails with "write after end", which broke
 * every process ensuring more than one topic.
 */
@Injectable()
export class KafkaTopicManager implements OnModuleDestroy {
  private readonly admin: Admin;
  private readonly ensuredTopics: Map<string, Promise<void>> = new Map();
  private adminQueue: Promise<void> = Promise.resolve();
  private connection: Promise<void> | undefined;

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
   * Closes the admin connection, if one was opened.
   */
  public async onModuleDestroy(): Promise<void> {
    if (this.connection === undefined) {
      return;
    }
    this.connection = undefined;
    await this.admin.disconnect();
  }

  /**
   * Runs admin work one topic at a time on the shared admin client.
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
    await this.connectAdmin();
    const existingTopics: string[] = await this.admin.listTopics();
    if (existingTopics.includes(topic)) {
      return;
    }
    await this.admin.createTopics({
      topics: [{ topic, numPartitions }],
      waitForLeaders: true,
    });
  }

  /**
   * Connects the admin client on first use; a failed attempt is forgotten so the next check retries.
   */
  private connectAdmin(): Promise<void> {
    this.connection ??= this.admin
      .connect()
      .catch((err: unknown): Promise<never> => {
        this.connection = undefined;
        return Promise.reject(err);
      });
    return this.connection;
  }
}

import {
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { IntegrationEventEnvelope } from '@org/contracts';
import { readBooleanEnv } from '@org/shared-infrastructure';
import type { Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaProducerService } from '../producer/kafka-producer.service';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { ConsumerRetryPolicy } from './consumer-retry-policy.type';
import { DeadLetterRecord } from './dead-letter-record.type';
import { EVENT_HEADERS } from './event-headers';
import { IntegrationEventContext } from './integration-event-context.type';
import { KafkaConsumerServiceProps } from './kafka-consumer-service.props';
import { KafkaSubscription } from './kafka-subscription.type';
import { parseEventEnvelope } from './parse-event-envelope.util';
import { readConsumerRetryPolicy } from './read-consumer-retry-policy.util';
import { readEventContext } from './read-event-context.util';

/** Suffix of the dead-letter topic of a subscription. */
const DEAD_LETTER_SUFFIX = '.dlq';

/** Outcome of the attempts to handle one message. */
interface AttemptOutcome {
  readonly attempts: number;
  /** Error of the last attempt, when every attempt failed. */
  readonly error?: unknown;
}

/**
 * Base of every integration-event consumer. It joins the consumer group (without auto-creating topics),
 * ensures the topic, and decodes each message into an envelope and its {@link IntegrationEventContext}
 * for {@link KafkaConsumerService.handleEnvelope}.
 *
 * Offsets are committed manually, only once a message is settled:
 * - handled: committed;
 * - handler throws (transient infrastructure error): retried with exponential backoff, heartbeats in
 *   between, up to `KAFKA_CONSUMER_MAX_ATTEMPTS`; then parked in `<topic>.dlq` and committed;
 * - undecodable: parked in `<topic>.dlq` and committed.
 * If the dead-letter publish itself fails, nothing is committed and Kafka redelivers the message.
 * Handlers must be idempotent (at-least-once delivery). Consumption starts in the background so HTTP and
 * gRPC servers are not blocked by Kafka.
 */
export abstract class KafkaConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  protected readonly logger: Logger;
  private readonly consumer: Consumer;
  private readonly topicManager: KafkaTopicManager;
  private readonly producer: KafkaProducerService;
  private readonly subscription: KafkaSubscription;
  private readonly retryPolicy: ConsumerRetryPolicy = readConsumerRetryPolicy();

  /**
   * @param props - Kafka client, topic manager, dead-letter producer and subscription.
   */
  protected constructor({
    kafka,
    topicManager,
    producer,
    subscription,
  }: KafkaConsumerServiceProps) {
    this.logger = new Logger(new.target.name);
    this.topicManager = topicManager;
    this.producer = producer;
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
   * Settles one message (handled, or parked in the dead-letter topic), then commits its offset.
   *
   * @param payload - Kafka message and its partition context.
   * @throws When the dead-letter publish or the commit fails; nothing is committed and Kafka redelivers.
   */
  public async handleMessage(payload: EachMessagePayload): Promise<void> {
    const envelope:
      IntegrationEventEnvelope<Record<string, unknown>> | undefined =
      parseEventEnvelope(payload.message.value);
    if (envelope === undefined) {
      this.logger.warn(
        `Parking malformed message at ${payload.topic}[${payload.partition}]@${payload.message.offset}`,
      );
      await this.sendToDeadLetter({
        payload,
        reason: 'MALFORMED',
        attempts: 0,
      });
      await this.commitOffset(payload);
      return;
    }
    const context: IntegrationEventContext = readEventContext({
      payload,
      envelope,
    });
    const outcome: AttemptOutcome = await this.executeAttempt({
      payload,
      envelope,
      context,
      attempt: 1,
    });
    if (outcome.error !== undefined) {
      await this.sendToDeadLetter({
        payload,
        context,
        ...outcome,
        reason: 'RETRIES_EXHAUSTED',
      });
    }
    await this.commitOffset(payload);
  }

  /**
   * Handles one decoded integration event. Throw only for unexpected (e.g. infrastructure) errors: they
   * are retried, then dead-lettered; log and return for business refusals.
   *
   * @param envelope - Decoded event.
   * @param context - Event id, correlation id and position.
   */
  protected abstract handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
    context: IntegrationEventContext,
  ): Promise<void>;

  /**
   * Ensures the topic, then connects, subscribes and starts the consumption loop with manual commits.
   */
  private async executeStart(): Promise<void> {
    const { topic, numPartitions, groupId }: KafkaSubscription =
      this.subscription;
    await this.topicManager.ensureTopic({ topic, numPartitions });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    await this.consumer.run({
      autoCommit: false,
      eachMessage: (payload: EachMessagePayload): Promise<void> =>
        this.handleMessage(payload),
    });
    this.logger.log(`Consuming ${topic} as ${groupId}`);
  }

  /**
   * Runs the handler; on failure waits (exponential backoff, heartbeat) and tries again until the policy
   * is exhausted.
   */
  private async executeAttempt({
    payload,
    envelope,
    context,
    attempt,
  }: {
    readonly payload: EachMessagePayload;
    readonly envelope: IntegrationEventEnvelope<Record<string, unknown>>;
    readonly context: IntegrationEventContext;
    readonly attempt: number;
  }): Promise<AttemptOutcome> {
    try {
      await this.handleEnvelope(envelope, context);
      return { attempts: attempt };
    } catch (err: unknown) {
      this.logger.warn(
        `Attempt ${attempt}/${this.retryPolicy.maxAttempts} failed for ${envelope.eventType} ${context.eventId} (correlation ${context.correlationId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      if (attempt >= this.retryPolicy.maxAttempts) {
        return { attempts: attempt, error: err };
      }
      await new Promise((resolve: (value: unknown) => void): void => {
        setTimeout(
          resolve,
          this.retryPolicy.initialBackoffMs * 2 ** (attempt - 1),
        );
      });
      await payload.heartbeat();
      return this.executeAttempt({
        payload,
        envelope,
        context,
        attempt: attempt + 1,
      });
    }
  }

  /**
   * Parks a message in `<topic>.dlq` with the reason, the last error and the original value.
   */
  private async sendToDeadLetter({
    payload,
    context,
    reason,
    attempts,
    error,
  }: {
    readonly payload: EachMessagePayload;
    readonly context?: IntegrationEventContext;
    readonly reason: DeadLetterRecord['reason'];
    readonly attempts: number;
    readonly error?: unknown;
  }): Promise<void> {
    const record: DeadLetterRecord = {
      originalTopic: payload.topic,
      partition: payload.partition,
      offset: payload.message.offset,
      eventId: context?.eventId,
      correlationId: context?.correlationId,
      reason,
      error:
        error === undefined
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      attempts,
      failedAt: Date.now(),
      originalValue: payload.message.value?.toString('utf8') ?? null,
    };
    await this.producer.send({
      topic: `${payload.topic}${DEAD_LETTER_SUFFIX}`,
      numPartitions: this.subscription.numPartitions,
      messages: [
        {
          key: payload.message.key,
          value: JSON.stringify(record),
          headers: {
            ...payload.message.headers,
            [EVENT_HEADERS.DEAD_LETTER_REASON]: reason,
          },
        },
      ],
    });
    this.logger.error(
      `Parked ${payload.topic}[${payload.partition}]@${payload.message.offset} in ${payload.topic}${DEAD_LETTER_SUFFIX} (${reason}, ${attempts} attempt(s))`,
    );
  }

  /**
   * Commits the offset after this message, so the group resumes at the next one.
   */
  private async commitOffset({
    topic,
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    await this.consumer.commitOffsets([
      { topic, partition, offset: (BigInt(message.offset) + 1n).toString() },
    ]);
  }
}

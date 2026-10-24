import { Admin, Kafka, Producer, RecordMetadata } from 'kafkajs';
import { waitUntil } from '../checkout/wait-until.util';
import { PublishPaymentEventInput } from './publish-payment-event.input';
import { PublishedMessage } from './published-message.type';

/** Topic of the payment events. */
const PAYMENTS_EVENTS_TOPIC = 'payments.events';

/** Partitions of the topic, as created by the services. */
const PAYMENTS_EVENTS_PARTITIONS = 3;

/**
 * Plays the payment-service in acceptance tests: publishes `payment.succeeded` / `payment.failed` envelopes
 * to `payments.events` (key = orderId, like the real producer) and waits until a consumer group has
 * committed past them.
 */
export class PaymentEventsProducer {
  private readonly kafka: Kafka = new Kafka({
    clientId: 'order-service-e2e',
    brokers: (process.env['E2E_KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
  });
  private readonly producer: Producer = this.kafka.producer();
  private readonly admin: Admin = this.kafka.admin();

  /**
   * Connects and makes sure the topic exists.
   */
  public async connect(): Promise<void> {
    await this.producer.connect();
    await this.admin.connect();
    const topics: string[] = await this.admin.listTopics();
    if (!topics.includes(PAYMENTS_EVENTS_TOPIC)) {
      await this.admin.createTopics({
        topics: [
          {
            topic: PAYMENTS_EVENTS_TOPIC,
            numPartitions: PAYMENTS_EVENTS_PARTITIONS,
          },
        ],
        waitForLeaders: true,
      });
    }
  }

  /**
   * @param input - Event type, id, order and lines.
   * @returns Where the message landed.
   */
  public async publish(
    input: PublishPaymentEventInput,
  ): Promise<PublishedMessage> {
    const [metadata]: RecordMetadata[] = await this.producer.send({
      topic: PAYMENTS_EVENTS_TOPIC,
      messages: [
        {
          key: input.orderId,
          value: JSON.stringify({
            eventId: input.eventId,
            eventType: input.eventType,
            aggregateId: input.orderId,
            occurredAt: Date.now(),
            payload: {
              paymentId: input.orderId,
              orderId: input.orderId,
              gatewayTxId: `e2e-${input.eventId}`,
              items: input.items,
              ...(input.reason !== undefined && { reason: input.reason }),
            },
          }),
          headers: {
            'event-type': input.eventType,
            'event-id': input.eventId,
            'x-correlation-id': input.orderId,
          },
        },
      ],
    });
    return {
      partition: metadata.partition,
      offset: String(metadata.baseOffset ?? metadata.offset),
    };
  }

  /**
   * Waits until a consumer group has committed an offset after the message (processed and committed).
   *
   * @param input - Group, message and timeout.
   */
  public async waitForCommit({
    groupId,
    message,
    timeoutMs,
  }: {
    readonly groupId: string;
    readonly message: PublishedMessage;
    readonly timeoutMs: number;
  }): Promise<void> {
    await waitUntil({
      description: `${groupId} to commit past ${PAYMENTS_EVENTS_TOPIC}[${message.partition}]@${message.offset}`,
      timeoutMs,
      probe: async (): Promise<true | undefined> => {
        const [topicOffsets] = await this.admin.fetchOffsets({
          groupId,
          topics: [PAYMENTS_EVENTS_TOPIC],
        });
        const committed: string | undefined = topicOffsets.partitions.find(
          (partition: { partition: number }): boolean =>
            partition.partition === message.partition,
        )?.offset;
        return committed !== undefined &&
          BigInt(committed) > BigInt(message.offset)
          ? true
          : undefined;
      },
    });
  }

  /**
   * Disconnects.
   */
  public async disconnect(): Promise<void> {
    await this.producer.disconnect();
    await this.admin.disconnect();
  }
}

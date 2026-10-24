import { IntegrationEventEnvelope } from '@org/contracts';
import type { EachMessagePayload, IHeaders, Kafka } from 'kafkajs';
import { KafkaProducerService } from '../producer/kafka-producer.service';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { IntegrationEventContext } from './integration-event-context.type';
import { KafkaConsumerService } from './kafka-consumer.service';

/**
 * Concrete consumer recording what it receives; `failures` makes the next calls throw.
 */
class TestConsumer extends KafkaConsumerService {
  public readonly received: {
    envelope: IntegrationEventEnvelope<Record<string, unknown>>;
    context: IntegrationEventContext;
  }[] = [];
  public failures: number = 0;

  public constructor(
    kafka: Kafka,
    topicManager: KafkaTopicManager,
    producer: KafkaProducerService,
  ) {
    super({
      kafka,
      topicManager,
      producer,
      subscription: {
        topic: 'orders.events',
        numPartitions: 3,
        groupId: 'test-group',
      },
    });
  }

  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
    context: IntegrationEventContext,
  ): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('database down');
    }
    this.received.push({ envelope, context });
  }
}

/** Valid envelope value. */
const ENVELOPE_VALUE: string = JSON.stringify({
  eventId: 'e1',
  eventType: 'order.placed',
  aggregateId: 'o1',
  occurredAt: 1,
  payload: { orderId: 'o1' },
});

/**
 * Builds a Kafka message payload carrying the given value and headers.
 */
const createMockPayload = (
  value: string | null,
  headers: IHeaders = {},
): EachMessagePayload =>
  ({
    topic: 'orders.events',
    partition: 2,
    message: {
      key: Buffer.from('o1'),
      value: value === null ? null : Buffer.from(value),
      offset: '41',
      headers,
    },
    heartbeat: jest.fn().mockResolvedValue(undefined),
  }) as unknown as EachMessagePayload;

describe('KafkaConsumerService', () => {
  let mockConsumer: {
    readonly connect: jest.Mock;
    readonly subscribe: jest.Mock;
    readonly run: jest.Mock;
    readonly disconnect: jest.Mock;
    readonly commitOffsets: jest.Mock;
  };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let mockProducer: { readonly send: jest.Mock };
  let consumer: TestConsumer;
  beforeEach(() => {
    process.env['KAFKA_CONSUMER_RETRY_BACKOFF_MS'] = '0';
    process.env['KAFKA_CONSUMER_MAX_ATTEMPTS'] = '3';
    mockConsumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      commitOffsets: jest.fn().mockResolvedValue(undefined),
    };
    mockKafka = { consumer: jest.fn().mockReturnValue(mockConsumer) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    mockProducer = { send: jest.fn().mockResolvedValue(undefined) };
    consumer = new TestConsumer(
      mockKafka as unknown as Kafka,
      mockTopicManager as unknown as KafkaTopicManager,
      mockProducer as unknown as KafkaProducerService,
    );
    jest
      .spyOn(consumer['logger'], 'warn')
      .mockImplementation((): void => undefined);
    jest
      .spyOn(consumer['logger'], 'log')
      .mockImplementation((): void => undefined);
    jest
      .spyOn(consumer['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    delete process.env['KAFKA_CONSUMER_RETRY_BACKOFF_MS'];
    delete process.env['KAFKA_CONSUMER_MAX_ATTEMPTS'];
  });
  it('should join the group without auto-creating topics', () => {
    // Arrange
    const expectedOptions: Record<string, unknown> = {
      groupId: 'test-group',
      allowAutoTopicCreation: false,
    };
    // Act
    const actualOptions: unknown = mockKafka.consumer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual(expectedOptions);
  });
  it('should ensure the topic, subscribe from the beginning and run with manual commits', async () => {
    // Arrange
    // Act
    consumer.onApplicationBootstrap();
    await new Promise(setImmediate);
    // Assert
    expect(mockTopicManager.ensureTopic).toHaveBeenCalledWith({
      topic: 'orders.events',
      numPartitions: 3,
    });
    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: 'orders.events',
      fromBeginning: true,
    });
    expect(mockConsumer.run).toHaveBeenCalledWith(
      expect.objectContaining({ autoCommit: false }),
    );
  });
  it('should log, not crash, when the consumer cannot start', async () => {
    // Arrange
    mockTopicManager.ensureTopic.mockRejectedValue(new Error('broker down'));
    // Act
    consumer.onApplicationBootstrap();
    await new Promise(setImmediate);
    // Assert
    expect(consumer['logger'].error).toHaveBeenCalledWith(
      expect.stringContaining('broker down'),
    );
  });
  describe('handleMessage', () => {
    it('should hand the envelope and its context to the subclass, then commit the next offset', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        ENVELOPE_VALUE,
        {
          'event-id': Buffer.from('e1'),
          'x-correlation-id': Buffer.from('order-o1'),
        },
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(consumer.received).toHaveLength(1);
      expect(consumer.received[0].context).toEqual({
        eventId: 'e1',
        correlationId: 'order-o1',
        topic: 'orders.events',
        partition: 2,
        offset: '41',
      });
      expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
        { topic: 'orders.events', partition: 2, offset: '42' },
      ]);
    });
    it('should fall back to the envelope event id as correlation id', async () => {
      // Arrange
      const inputPayload: EachMessagePayload =
        createMockPayload(ENVELOPE_VALUE);
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(consumer.received[0].context).toMatchObject({
        eventId: 'e1',
        correlationId: 'e1',
      });
    });
    it('should retry a transient failure and commit once it succeeds', async () => {
      // Arrange
      consumer.failures = 2;
      const inputPayload: EachMessagePayload =
        createMockPayload(ENVELOPE_VALUE);
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(consumer.received).toHaveLength(1);
      expect(inputPayload.heartbeat).toHaveBeenCalledTimes(2);
      expect(mockProducer.send).not.toHaveBeenCalled();
      expect(mockConsumer.commitOffsets).toHaveBeenCalledTimes(1);
    });
    it('should park the message in the dead-letter topic after the last attempt, then commit', async () => {
      // Arrange
      consumer.failures = 3;
      const inputPayload: EachMessagePayload =
        createMockPayload(ENVELOPE_VALUE);
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(consumer.received).toHaveLength(0);
      const actualSend: {
        topic: string;
        messages: { value: string; headers: Record<string, unknown> }[];
      } = mockProducer.send.mock.calls[0][0];
      expect(actualSend.topic).toBe('orders.events.dlq');
      expect(JSON.parse(actualSend.messages[0].value)).toMatchObject({
        originalTopic: 'orders.events',
        partition: 2,
        offset: '41',
        eventId: 'e1',
        reason: 'RETRIES_EXHAUSTED',
        error: 'database down',
        attempts: 3,
        originalValue: ENVELOPE_VALUE,
      });
      expect(actualSend.messages[0].headers['x-dead-letter-reason']).toBe(
        'RETRIES_EXHAUSTED',
      );
      expect(mockConsumer.commitOffsets).toHaveBeenCalledTimes(1);
    });
    it.each([null, 'not json', '{"payload":{}}'])(
      'should park the malformed value %p without calling the subclass',
      async (inputValue: string | null) => {
        // Arrange
        const inputPayload: EachMessagePayload = createMockPayload(inputValue);
        // Act
        await consumer.handleMessage(inputPayload);
        // Assert
        expect(consumer.received).toHaveLength(0);
        expect(
          JSON.parse(mockProducer.send.mock.calls[0][0].messages[0].value),
        ).toMatchObject({
          reason: 'MALFORMED',
          attempts: 0,
        });
        expect(mockConsumer.commitOffsets).toHaveBeenCalledTimes(1);
      },
    );
    it('should not commit when the dead-letter publish fails, so Kafka redelivers', async () => {
      // Arrange
      consumer.failures = 3;
      mockProducer.send.mockRejectedValue(new Error('broker down'));
      // Act
      const actualHandling: Promise<void> = consumer.handleMessage(
        createMockPayload(ENVELOPE_VALUE),
      );
      // Assert
      await expect(actualHandling).rejects.toThrow('broker down');
      expect(mockConsumer.commitOffsets).not.toHaveBeenCalled();
    });
  });
  it('should leave the group on shutdown', async () => {
    // Arrange
    // Act
    await consumer.onModuleDestroy();
    // Assert
    expect(mockConsumer.disconnect).toHaveBeenCalledTimes(1);
  });
  it('should not connect when KAFKA_CONSUMERS_ENABLED is false', async () => {
    // Arrange
    process.env['KAFKA_CONSUMERS_ENABLED'] = 'false';
    // Act
    consumer.onApplicationBootstrap();
    await new Promise(setImmediate);
    // Assert
    delete process.env['KAFKA_CONSUMERS_ENABLED'];
    expect(mockConsumer.connect).not.toHaveBeenCalled();
    expect(consumer['logger'].log).toHaveBeenCalledWith(
      'Disabled by KAFKA_CONSUMERS_ENABLED; not consuming orders.events',
    );
  });
});

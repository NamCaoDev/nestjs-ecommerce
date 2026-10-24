import { IntegrationEventEnvelope } from '@org/contracts';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { KafkaConsumerService } from './kafka-consumer.service';

/**
 * Concrete consumer recording the envelopes it receives.
 */
class TestConsumer extends KafkaConsumerService {
  public readonly receivedEnvelopes: IntegrationEventEnvelope<
    Record<string, unknown>
  >[] = [];

  public constructor(kafka: Kafka, topicManager: KafkaTopicManager) {
    super({
      kafka,
      topicManager,
      subscription: {
        topic: 'orders.events',
        numPartitions: 3,
        groupId: 'test-group',
      },
    });
  }

  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    if (envelope.eventType === 'boom') {
      throw new Error('handler failed');
    }
    this.receivedEnvelopes.push(envelope);
  }
}

/**
 * Builds a Kafka message payload carrying the given value.
 */
const createMockPayload = (value: string | null): EachMessagePayload =>
  ({
    message: { value: value === null ? null : Buffer.from(value), offset: '5' },
  }) as unknown as EachMessagePayload;

describe('KafkaConsumerService', () => {
  let mockConsumer: {
    readonly connect: jest.Mock;
    readonly subscribe: jest.Mock;
    readonly run: jest.Mock;
    readonly disconnect: jest.Mock;
  };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let consumer: TestConsumer;
  beforeEach(() => {
    mockConsumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    mockKafka = { consumer: jest.fn().mockReturnValue(mockConsumer) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    consumer = new TestConsumer(
      mockKafka as unknown as Kafka,
      mockTopicManager as unknown as KafkaTopicManager,
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
  it('should ensure the topic, then subscribe from the beginning and run', async () => {
    // Arrange
    const expectedTopic: string = 'orders.events';
    // Act
    consumer.onApplicationBootstrap();
    await new Promise(setImmediate);
    // Assert
    expect(mockTopicManager.ensureTopic).toHaveBeenCalledWith({
      topic: expectedTopic,
      numPartitions: 3,
    });
    expect(mockConsumer.subscribe).toHaveBeenCalledWith({
      topic: expectedTopic,
      fromBeginning: true,
    });
    expect(mockConsumer.run).toHaveBeenCalledTimes(1);
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
    it('should decode the envelope and hand it to the subclass', async () => {
      // Arrange
      const inputValue: string = JSON.stringify({
        eventId: 'e1',
        eventType: 'order.placed',
        aggregateId: 'o1',
        occurredAt: 1,
        payload: { orderId: 'o1' },
      });
      // Act
      await consumer.handleMessage(createMockPayload(inputValue));
      // Assert
      expect(consumer.receivedEnvelopes).toHaveLength(1);
      expect(consumer.receivedEnvelopes[0].payload).toEqual({ orderId: 'o1' });
    });
    it.each([null, 'not json', '{"payload":{}}'])(
      'should skip the malformed value %p',
      async (inputValue: string | null) => {
        // Arrange
        const inputPayload: EachMessagePayload = createMockPayload(inputValue);
        // Act
        await consumer.handleMessage(inputPayload);
        // Assert
        expect(consumer.receivedEnvelopes).toHaveLength(0);
        expect(consumer['logger'].warn).toHaveBeenCalledTimes(1);
      },
    );
    it('should rethrow handler errors so Kafka redelivers the message', async () => {
      // Arrange
      const inputValue: string = JSON.stringify({
        eventType: 'boom',
        payload: {},
      });
      // Act
      const actualHandling: Promise<void> = consumer.handleMessage(
        createMockPayload(inputValue),
      );
      // Assert
      await expect(actualHandling).rejects.toThrow('handler failed');
    });
  });
  it('should leave the group on shutdown', async () => {
    // Arrange
    const expectedCalls: number = 1;
    // Act
    await consumer.onModuleDestroy();
    // Assert
    expect(mockConsumer.disconnect).toHaveBeenCalledTimes(expectedCalls);
  });
});

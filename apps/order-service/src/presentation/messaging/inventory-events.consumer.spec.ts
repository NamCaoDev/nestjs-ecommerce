import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { KafkaProducerService, KafkaTopicManager } from '@org/shared-messaging';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { CancelOrderCommand } from '../../application/commands/cancel-order/cancel-order.command';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { InventoryEventsConsumer } from './inventory-events.consumer';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';

/**
 * Builds a Kafka message payload carrying the given value.
 */
const createMockPayload = (value: string | null): EachMessagePayload =>
  ({
    topic: 'inventory.events',
    partition: 0,
    message: {
      value: value === null ? null : Buffer.from(value),
      offset: '3',
      headers: {},
    },
    heartbeat: jest.fn().mockResolvedValue(undefined),
  }) as unknown as EachMessagePayload;

/**
 * Serialises a `stock.reservation_failed` envelope.
 */
const createReservationFailedValue = (): string =>
  JSON.stringify({
    eventId: 'e1',
    eventType: 'stock.reservation_failed',
    aggregateId: ORDER_ID,
    occurredAt: 1,
    payload: { orderId: ORDER_ID, items: [], reason: 'EXPIRED_OUT_OF_STOCK' },
  });

describe('InventoryEventsConsumer', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let mockProducer: { readonly send: jest.Mock };
  let consumer: InventoryEventsConsumer;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    process.env['KAFKA_CONSUMER_MAX_ATTEMPTS'] = '2';
    process.env['KAFKA_CONSUMER_RETRY_BACKOFF_MS'] = '0';
    mockKafka = {
      consumer: jest.fn().mockReturnValue({
        commitOffsets: jest.fn().mockResolvedValue(undefined),
      }),
    };
    mockProducer = { send: jest.fn().mockResolvedValue(undefined) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    consumer = new InventoryEventsConsumer(
      mockKafka as unknown as Kafka,
      mockTopicManager as unknown as KafkaTopicManager,
      mockProducer as unknown as KafkaProducerService,
      mockCommandBus as unknown as CommandBus,
    );
    jest
      .spyOn(consumer['logger'], 'warn')
      .mockImplementation((): void => undefined);
    jest
      .spyOn(consumer['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    delete process.env['KAFKA_CONSUMER_MAX_ATTEMPTS'];
    delete process.env['KAFKA_CONSUMER_RETRY_BACKOFF_MS'];
  });
  it('should join the order consumer group without auto-creating topics', () => {
    // Arrange
    const expectedOptions: Record<string, unknown> = {
      groupId: 'order-consumer-group',
      allowAutoTopicCreation: false,
    };
    // Act
    const actualOptions: unknown = mockKafka.consumer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual(expectedOptions);
  });
  describe('handleMessage', () => {
    it('should cancel the order on stock.reservation_failed', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createReservationFailedValue(),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: CancelOrderCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(CancelOrderCommand);
      expect(actualCommand.orderId).toBe(ORDER_ID);
      expect(actualCommand.reason).toBe('EXPIRED_OUT_OF_STOCK');
    });
    it('should ignore other inventory events', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        JSON.stringify({ eventType: 'stock.restocked', payload: {} }),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });
    it.each([null, 'not json'])(
      'should park the malformed value %p in the dead-letter topic',
      async (inputValue: string | null) => {
        // Arrange
        const inputPayload: EachMessagePayload = createMockPayload(inputValue);
        // Act
        await consumer.handleMessage(inputPayload);
        // Assert
        expect(mockCommandBus.execute).not.toHaveBeenCalled();
        expect(consumer['logger'].warn).toHaveBeenCalledTimes(1);
      },
    );
    it('should log and skip a business refusal', async () => {
      // Arrange
      mockCommandBus.execute.mockResolvedValue(
        Result.fail(new OrderNotFoundError(ORDER_ID)),
      );
      // Act
      await consumer.handleMessage(
        createMockPayload(createReservationFailedValue()),
      );
      // Assert
      expect(consumer['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('does not exist'),
      );
    });
    it('should retry unexpected errors, then park the message in the dead-letter topic', async () => {
      // Arrange
      mockCommandBus.execute.mockRejectedValue(new Error('database down'));
      // Act
      await consumer.handleMessage(
        createMockPayload(createReservationFailedValue()),
      );
      // Assert
      expect(mockCommandBus.execute).toHaveBeenCalledTimes(2);
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'inventory.events.dlq' }),
      );
    });
  });
});

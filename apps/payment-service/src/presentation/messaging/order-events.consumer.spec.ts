import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { KafkaProducerService, KafkaTopicManager } from '@org/shared-messaging';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { InitiatePaymentCommand } from '../../application/commands/initiate-payment/initiate-payment.command';
import { InvalidMoneyError } from '../../domain/errors/invalid-money.error';
import { OrderEventsConsumer } from './order-events.consumer';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';
const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

/**
 * Builds a Kafka message payload carrying the given value.
 */
const createMockPayload = (value: string | null): EachMessagePayload =>
  ({
    topic: 'orders.events',
    partition: 0,
    message: {
      value: value === null ? null : Buffer.from(value),
      offset: '7',
      headers: {},
    },
    heartbeat: jest.fn().mockResolvedValue(undefined),
  }) as unknown as EachMessagePayload;

/**
 * Serialises an `order.placed` envelope.
 */
const createOrderPlacedValue = (): string =>
  JSON.stringify({
    eventId: 'event-1',
    eventType: 'order.placed',
    aggregateId: ORDER_ID,
    occurredAt: 1,
    payload: {
      orderId: ORDER_ID,
      customerId: CUSTOMER_ID,
      finalAmount: 39.98,
      currency: 'USD',
      items: [{ skuId: SKU_ID, quantity: 2, unitPrice: 19.99 }],
      createdAt: 1,
    },
  });

describe('OrderEventsConsumer', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let mockProducer: { readonly send: jest.Mock };
  let consumer: OrderEventsConsumer;
  beforeEach(() => {
    mockCommandBus = {
      execute: jest.fn().mockResolvedValue(Result.ok({ paymentId: 'p1' })),
    };
    process.env['KAFKA_CONSUMER_MAX_ATTEMPTS'] = '2';
    process.env['KAFKA_CONSUMER_RETRY_BACKOFF_MS'] = '0';
    mockKafka = {
      consumer: jest.fn().mockReturnValue({
        commitOffsets: jest.fn().mockResolvedValue(undefined),
      }),
    };
    mockProducer = { send: jest.fn().mockResolvedValue(undefined) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    consumer = new OrderEventsConsumer(
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
  it('should join the payment consumer group without auto-creating topics', () => {
    // Arrange
    const expectedGroupId: string = 'payment-consumer-group';
    // Act
    const actualOptions: unknown = mockKafka.consumer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual({
      groupId: expectedGroupId,
      allowAutoTopicCreation: false,
    });
  });
  describe('handleMessage', () => {
    it('should initiate the payment of a placed order, keyed by the event id', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createOrderPlacedValue(),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: InitiatePaymentCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(InitiatePaymentCommand);
      expect(actualCommand).toMatchObject({
        orderId: ORDER_ID,
        customerId: CUSTOMER_ID,
        amount: 39.98,
        currency: 'USD',
        items: [{ skuId: SKU_ID, quantity: 2 }],
        idempotencyKey: 'event-1',
      });
    });
    it('should ignore other order events', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        JSON.stringify({ eventType: 'order.confirmed', payload: {} }),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });
    it('should log and skip an order it cannot charge', async () => {
      // Arrange
      mockCommandBus.execute.mockResolvedValue(
        Result.fail(new InvalidMoneyError('currency must be ISO 4217')),
      );
      // Act
      await consumer.handleMessage(createMockPayload(createOrderPlacedValue()));
      // Assert
      expect(consumer['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping event event-1'),
      );
    });
    it('should retry unexpected errors, then park the message in the dead-letter topic', async () => {
      // Arrange
      mockCommandBus.execute.mockRejectedValue(new Error('database down'));
      // Act
      await consumer.handleMessage(createMockPayload(createOrderPlacedValue()));
      // Assert
      expect(mockCommandBus.execute).toHaveBeenCalledTimes(2);
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'orders.events.dlq' }),
      );
    });
  });
});

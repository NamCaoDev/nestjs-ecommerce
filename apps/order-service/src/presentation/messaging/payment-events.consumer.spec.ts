import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { KafkaProducerService, KafkaTopicManager } from '@org/shared-messaging';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { ProcessPaymentFailedCommand } from '../../application/commands/process-payment-failed/process-payment-failed.command';
import { ProcessPaymentSucceededCommand } from '../../application/commands/process-payment-succeeded/process-payment-succeeded.command';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { PaymentEventsConsumer } from './payment-events.consumer';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';

/**
 * Builds the Kafka payload of a `payments.events` message with id and correlation headers.
 */
const createMockPayload = (
  eventType: string,
  payload: Record<string, unknown> = {},
): EachMessagePayload =>
  ({
    topic: 'payments.events',
    partition: 1,
    message: {
      value: Buffer.from(
        JSON.stringify({
          eventId: 'envelope-id',
          eventType,
          aggregateId: 'p1',
          occurredAt: 1,
          payload: { orderId: ORDER_ID, items: [], ...payload },
        }),
      ),
      offset: '9',
      headers: {
        'event-id': Buffer.from('e1'),
        'x-correlation-id': Buffer.from(ORDER_ID),
      },
    },
    heartbeat: jest.fn().mockResolvedValue(undefined),
  }) as unknown as EachMessagePayload;

describe('PaymentEventsConsumer', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockCommitOffsets: jest.Mock;
  let mockProducer: { readonly send: jest.Mock };
  let consumer: PaymentEventsConsumer;
  beforeEach(() => {
    process.env['KAFKA_CONSUMER_MAX_ATTEMPTS'] = '2';
    process.env['KAFKA_CONSUMER_RETRY_BACKOFF_MS'] = '0';
    mockCommandBus = {
      execute: jest.fn().mockResolvedValue(Result.ok('APPLIED')),
    };
    mockCommitOffsets = jest.fn().mockResolvedValue(undefined);
    mockKafka = {
      consumer: jest.fn().mockReturnValue({ commitOffsets: mockCommitOffsets }),
    };
    mockProducer = { send: jest.fn().mockResolvedValue(undefined) };
    consumer = new PaymentEventsConsumer(
      mockKafka as unknown as Kafka,
      { ensureTopic: jest.fn() } as unknown as KafkaTopicManager,
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
  it('should join its own consumer group without auto-creating topics', () => {
    // Arrange
    const expectedOptions: Record<string, unknown> = {
      groupId: 'order-payment-consumer-group',
      allowAutoTopicCreation: false,
    };
    // Act
    const actualOptions: unknown = mockKafka.consumer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual(expectedOptions);
  });
  describe('handleMessage', () => {
    it('should dispatch ProcessPaymentSucceededCommand keyed by the event id header, then commit', async () => {
      // Arrange
      const inputPayload: EachMessagePayload =
        createMockPayload('payment.succeeded');
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: ProcessPaymentSucceededCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(ProcessPaymentSucceededCommand);
      expect(actualCommand).toMatchObject({
        eventId: 'e1',
        correlationId: ORDER_ID,
        orderId: ORDER_ID,
        payload: { orderId: ORDER_ID, items: [] },
      });
      expect(mockCommitOffsets).toHaveBeenCalledWith([
        { topic: 'payments.events', partition: 1, offset: '10' },
      ]);
    });
    it('should dispatch ProcessPaymentFailedCommand with the gateway reason', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        'payment.failed',
        { reason: 'CARD_DECLINED' },
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: ProcessPaymentFailedCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(ProcessPaymentFailedCommand);
      expect(actualCommand).toMatchObject({
        eventId: 'e1',
        orderId: ORDER_ID,
        reason: 'CARD_DECLINED',
      });
    });
    it('should ignore other payment events and still commit', async () => {
      // Arrange
      const inputPayload: EachMessagePayload =
        createMockPayload('payment.refunded');
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
      expect(mockCommitOffsets).toHaveBeenCalledTimes(1);
    });
    it('should log a business refusal and commit', async () => {
      // Arrange
      mockCommandBus.execute.mockResolvedValue(
        Result.fail(new OrderNotFoundError(ORDER_ID)),
      );
      // Act
      await consumer.handleMessage(createMockPayload('payment.succeeded'));
      // Assert
      expect(consumer['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping event e1'),
      );
      expect(mockCommitOffsets).toHaveBeenCalledTimes(1);
    });
    it('should retry an infrastructure error, then park the message in payments.events.dlq', async () => {
      // Arrange
      mockCommandBus.execute.mockRejectedValue(new Error('database down'));
      // Act
      await consumer.handleMessage(createMockPayload('payment.succeeded'));
      // Assert
      expect(mockCommandBus.execute).toHaveBeenCalledTimes(2);
      expect(mockProducer.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'payments.events.dlq' }),
      );
      expect(mockCommitOffsets).toHaveBeenCalledTimes(1);
    });
  });
});

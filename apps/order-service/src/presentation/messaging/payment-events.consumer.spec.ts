import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { KafkaTopicManager } from '@org/shared-messaging';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { CancelOrderCommand } from '../../application/commands/cancel-order/cancel-order.command';
import { ConfirmOrderCommand } from '../../application/commands/confirm-order/confirm-order.command';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { PaymentEventsConsumer } from './payment-events.consumer';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';

/**
 * Builds a Kafka message payload carrying the given value.
 */
const createMockPayload = (value: string | null): EachMessagePayload =>
  ({
    message: {
      value: value === null ? null : Buffer.from(value),
      offset: '3',
    },
  }) as unknown as EachMessagePayload;

/**
 * Serialises a `payments.events` envelope of the given type.
 */
const createPaymentEventValue = (
  eventType: string,
  payload: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    eventId: 'e1',
    eventType,
    aggregateId: 'p1',
    occurredAt: 1,
    payload: { orderId: ORDER_ID, items: [], ...payload },
  });

describe('PaymentEventsConsumer', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let consumer: PaymentEventsConsumer;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    mockKafka = { consumer: jest.fn().mockReturnValue({}) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    consumer = new PaymentEventsConsumer(
      mockKafka as unknown as Kafka,
      mockTopicManager as unknown as KafkaTopicManager,
      mockCommandBus as unknown as CommandBus,
    );
    jest
      .spyOn(consumer['logger'], 'warn')
      .mockImplementation((): void => undefined);
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
    it('should confirm the order on payment.succeeded', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createPaymentEventValue('payment.succeeded'),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: ConfirmOrderCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(ConfirmOrderCommand);
      expect(actualCommand.orderId).toBe(ORDER_ID);
    });
    it('should cancel the order with the gateway reason on payment.failed', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createPaymentEventValue('payment.failed', { reason: 'CARD_DECLINED' }),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: CancelOrderCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(CancelOrderCommand);
      expect(actualCommand.orderId).toBe(ORDER_ID);
      expect(actualCommand.reason).toBe('PAYMENT_FAILED: CARD_DECLINED');
    });
    it('should ignore other payment events', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createPaymentEventValue('payment.refunded'),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });
    it('should log and skip a business refusal', async () => {
      // Arrange
      mockCommandBus.execute.mockResolvedValue(
        Result.fail(new OrderNotFoundError(ORDER_ID)),
      );
      // Act
      await consumer.handleMessage(
        createMockPayload(createPaymentEventValue('payment.succeeded')),
      );
      // Assert
      expect(consumer['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('does not exist'),
      );
    });
    it('should rethrow unexpected errors so Kafka redelivers the message', async () => {
      // Arrange
      const expectedError: Error = new Error('concurrency conflict');
      mockCommandBus.execute.mockRejectedValue(expectedError);
      // Act
      const actualHandling: Promise<void> = consumer.handleMessage(
        createMockPayload(createPaymentEventValue('payment.succeeded')),
      );
      // Assert
      await expect(actualHandling).rejects.toBe(expectedError);
    });
  });
});

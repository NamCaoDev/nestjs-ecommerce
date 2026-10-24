import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { KafkaTopicManager } from '@org/shared-messaging';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { CommitStockCommand } from '../../application/commands/commit-stock/commit-stock.command';
import { ReleaseOrderStockCommand } from '../../application/commands/release-order-stock/release-order-stock.command';
import { PaymentEventsConsumer } from './payment-events.consumer';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

/**
 * Builds a Kafka message payload carrying the given value.
 */
const createMockPayload = (value: string | null): EachMessagePayload =>
  ({
    message: {
      value: value === null ? null : Buffer.from(value),
      offset: '7',
    },
  }) as unknown as EachMessagePayload;

/**
 * Serialises a `payments.events` envelope of the given type.
 */
const createPaymentEventValue = (eventType: string): string =>
  JSON.stringify({
    eventId: 'e1',
    eventType,
    aggregateId: 'p1',
    occurredAt: 1,
    payload: {
      orderId: ORDER_ID,
      items: [{ skuId: SKU_ID, quantity: 2 }],
    },
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
  it('should join the inventory payment consumer group without auto-creating topics', () => {
    // Arrange
    const expectedGroupId: string = 'inventory-payment-consumer-group';
    // Act
    const actualOptions: unknown = mockKafka.consumer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual({
      groupId: expectedGroupId,
      allowAutoTopicCreation: false,
    });
  });
  describe('handleMessage', () => {
    it('should commit the stock on payment.succeeded', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createPaymentEventValue('payment.succeeded'),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: CommitStockCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(CommitStockCommand);
      expect(actualCommand.orderId).toBe(ORDER_ID);
      expect(actualCommand.items).toEqual([{ skuId: SKU_ID, quantity: 2 }]);
    });
    it('should release the stock on payment.failed', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        createPaymentEventValue('payment.failed'),
      );
      // Act
      await consumer.handleMessage(inputPayload);
      // Assert
      const actualCommand: ReleaseOrderStockCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(ReleaseOrderStockCommand);
      expect(actualCommand.orderId).toBe(ORDER_ID);
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
    it.each([null, 'not json', '{"payload":{}}'])(
      'should skip the malformed value %p',
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
    it('should rethrow unexpected errors so Kafka redelivers the message', async () => {
      // Arrange
      const expectedError: Error = new Error('Redis unavailable');
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

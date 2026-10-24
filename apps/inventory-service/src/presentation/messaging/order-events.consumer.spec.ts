import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { KafkaTopicManager } from '@org/shared-messaging';
import type { EachMessagePayload, Kafka } from 'kafkajs';
import { CommitStockCommand } from '../../application/commands/commit-stock/commit-stock.command';
import { OrderEventsConsumer } from './order-events.consumer';

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

describe('OrderEventsConsumer', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockKafka: { readonly consumer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let consumer: OrderEventsConsumer;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    mockKafka = { consumer: jest.fn().mockReturnValue({}) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    consumer = new OrderEventsConsumer(
      mockKafka as unknown as Kafka,
      mockTopicManager as unknown as KafkaTopicManager,
      mockCommandBus as unknown as CommandBus,
    );
    jest
      .spyOn(consumer['logger'], 'warn')
      .mockImplementation((): void => undefined);
  });
  it('should join the inventory consumer group without auto-creating topics', () => {
    // Arrange
    const expectedGroupId: string = 'inventory-consumer-group';
    // Act
    const actualOptions: unknown = mockKafka.consumer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual({
      groupId: expectedGroupId,
      allowAutoTopicCreation: false,
    });
  });
  describe('handleMessage', () => {
    it('should dispatch CommitStockCommand for order.placed', async () => {
      // Arrange
      const inputPayload: EachMessagePayload = createMockPayload(
        JSON.stringify({
          eventId: 'e1',
          eventType: 'order.placed',
          aggregateId: ORDER_ID,
          occurredAt: 1,
          payload: {
            orderId: ORDER_ID,
            items: [{ skuId: SKU_ID, quantity: 2, unitPrice: 19.99 }],
          },
        }),
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
        createMockPayload(
          JSON.stringify({
            eventType: 'order.placed',
            payload: { orderId: ORDER_ID },
          }),
        ),
      );
      // Assert
      await expect(actualHandling).rejects.toBe(expectedError);
    });
  });
});

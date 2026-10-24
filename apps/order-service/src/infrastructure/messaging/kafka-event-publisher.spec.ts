import { KafkaProducerService } from '@org/shared-messaging';
import { OutboxMessage } from '../../application/ports/outbox-message.type';
import { KafkaEventPublisher } from './kafka-event-publisher';

const INPUT_MESSAGE: OutboxMessage = {
  id: 'e1',
  aggregateId: '0199a7c0-0000-7000-8000-000000000001',
  eventType: 'order.placed',
  payload: { orderId: '0199a7c0-0000-7000-8000-000000000001' },
  occurredAt: 1_792_843_000_000,
  retryCount: 0,
};

describe('KafkaEventPublisher', () => {
  let mockProducer: { readonly send: jest.Mock };
  let publisher: KafkaEventPublisher;
  beforeEach(() => {
    mockProducer = { send: jest.fn().mockResolvedValue(undefined) };
    publisher = new KafkaEventPublisher(
      mockProducer as unknown as KafkaProducerService,
    );
  });
  describe('publish', () => {
    it('should send envelopes to orders.events keyed by orderId', async () => {
      // Arrange
      const expectedEnvelope: Record<string, unknown> = {
        eventId: 'e1',
        eventType: 'order.placed',
        aggregateId: INPUT_MESSAGE.aggregateId,
        occurredAt: INPUT_MESSAGE.occurredAt,
        payload: INPUT_MESSAGE.payload,
      };
      // Act
      await publisher.publish([INPUT_MESSAGE]);
      // Assert
      const actualInput: {
        topic: string;
        numPartitions: number;
        messages: { key: string; value: string; headers: object }[];
      } = mockProducer.send.mock.calls[0][0];
      expect(actualInput.topic).toBe('orders.events');
      expect(actualInput.numPartitions).toBe(3);
      expect(actualInput.messages[0].key).toBe(INPUT_MESSAGE.aggregateId);
      expect(JSON.parse(actualInput.messages[0].value)).toEqual(
        expectedEnvelope,
      );
      expect(actualInput.messages[0].headers).toEqual({
        'event-type': 'order.placed',
        'event-id': 'e1',
      });
    });
    it('should propagate broker failures to the relay', async () => {
      // Arrange
      mockProducer.send.mockRejectedValue(new Error('broker down'));
      // Act
      const actualPublish: Promise<void> = publisher.publish([INPUT_MESSAGE]);
      // Assert
      await expect(actualPublish).rejects.toThrow('broker down');
    });
  });
});

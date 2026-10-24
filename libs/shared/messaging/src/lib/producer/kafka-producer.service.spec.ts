import { CompressionTypes } from 'kafkajs';
import type { Kafka, Message } from 'kafkajs';
import { KafkaTopicManager } from '../topics/kafka-topic.manager';
import { KafkaProducerService } from './kafka-producer.service';

const INPUT_MESSAGES: Message[] = [{ key: 'o1', value: '{"eventId":"e1"}' }];

describe('KafkaProducerService', () => {
  let mockProducer: {
    readonly connect: jest.Mock;
    readonly send: jest.Mock;
    readonly disconnect: jest.Mock;
  };
  let mockKafka: { readonly producer: jest.Mock };
  let mockTopicManager: { readonly ensureTopic: jest.Mock };
  let service: KafkaProducerService;
  beforeEach(() => {
    mockProducer = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    mockKafka = { producer: jest.fn().mockReturnValue(mockProducer) };
    mockTopicManager = { ensureTopic: jest.fn().mockResolvedValue(undefined) };
    service = new KafkaProducerService(
      mockKafka as unknown as Kafka,
      mockTopicManager as unknown as KafkaTopicManager,
    );
  });
  it('should use an idempotent producer with one in-flight request', () => {
    // Arrange
    const expectedOptions: Record<string, unknown> = {
      idempotent: true,
      maxInFlightRequests: 1,
    };
    // Act
    const actualOptions: unknown = mockKafka.producer.mock.calls[0][0];
    // Assert
    expect(actualOptions).toEqual(expectedOptions);
  });
  describe('send', () => {
    it('should ensure the topic and send with acks=all and Snappy compression', async () => {
      // Arrange
      const expectedRecord: Record<string, unknown> = {
        topic: 'orders.events',
        acks: -1,
        compression: CompressionTypes.Snappy,
        messages: INPUT_MESSAGES,
      };
      // Act
      await service.send({
        topic: 'orders.events',
        numPartitions: 3,
        messages: INPUT_MESSAGES,
      });
      // Assert
      expect(mockTopicManager.ensureTopic).toHaveBeenCalledWith({
        topic: 'orders.events',
        numPartitions: 3,
      });
      expect(mockProducer.send).toHaveBeenCalledWith(expectedRecord);
    });
    it('should connect once and retry the connection after a failure', async () => {
      // Arrange
      mockProducer.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(
        service.send({
          topic: 't',
          numPartitions: 1,
          messages: INPUT_MESSAGES,
        }),
      ).rejects.toThrow('ECONNREFUSED');
      // Act
      await service.send({
        topic: 't',
        numPartitions: 1,
        messages: INPUT_MESSAGES,
      });
      await service.send({
        topic: 't',
        numPartitions: 1,
        messages: INPUT_MESSAGES,
      });
      // Assert
      expect(mockProducer.connect).toHaveBeenCalledTimes(2);
      expect(mockProducer.send).toHaveBeenCalledTimes(2);
    });
  });
  describe('onModuleDestroy', () => {
    it('should only disconnect a producer that was connected', async () => {
      // Arrange
      await service.onModuleDestroy();
      await service.send({
        topic: 't',
        numPartitions: 1,
        messages: INPUT_MESSAGES,
      });
      // Act
      await service.onModuleDestroy();
      // Assert
      expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});

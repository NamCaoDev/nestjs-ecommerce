import type { Kafka } from 'kafkajs';
import { KafkaTopicManager } from './kafka-topic.manager';

describe('KafkaTopicManager', () => {
  let mockAdmin: {
    readonly connect: jest.Mock;
    readonly listTopics: jest.Mock;
    readonly createTopics: jest.Mock;
    readonly disconnect: jest.Mock;
  };
  let manager: KafkaTopicManager;
  beforeEach(() => {
    mockAdmin = {
      connect: jest.fn().mockResolvedValue(undefined),
      listTopics: jest.fn().mockResolvedValue([]),
      createTopics: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    manager = new KafkaTopicManager({
      admin: jest.fn().mockReturnValue(mockAdmin),
    } as unknown as Kafka);
  });
  it('should create a missing topic with its partition count', async () => {
    // Arrange
    const inputTopic: string = 'orders.events';
    // Act
    await manager.ensureTopic({ topic: inputTopic, numPartitions: 3 });
    // Assert
    expect(mockAdmin.createTopics).toHaveBeenCalledWith({
      topics: [{ topic: inputTopic, numPartitions: 3 }],
      waitForLeaders: true,
    });
  });
  it('should leave an existing topic untouched', async () => {
    // Arrange
    mockAdmin.listTopics.mockResolvedValue(['orders.events']);
    // Act
    await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
    // Assert
    expect(mockAdmin.createTopics).not.toHaveBeenCalled();
  });
  it('should check each topic once per process', async () => {
    // Arrange
    await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
    // Act
    await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
    // Assert
    expect(mockAdmin.listTopics).toHaveBeenCalledTimes(1);
  });
  it('should check several topics on one admin connection, one at a time', async () => {
    // Arrange
    const actualCalls: string[] = [];
    mockAdmin.connect.mockImplementation(async (): Promise<void> => {
      actualCalls.push('connect');
    });
    mockAdmin.listTopics.mockImplementation(async (): Promise<string[]> => {
      actualCalls.push('listTopics');
      return [];
    });
    mockAdmin.createTopics.mockImplementation(
      async ({ topics }: { topics: { topic: string }[] }): Promise<boolean> => {
        actualCalls.push(`create ${topics[0].topic}`);
        return true;
      },
    );
    // Act
    await Promise.all([
      manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 }),
      manager.ensureTopic({ topic: 'payments.events', numPartitions: 3 }),
    ]);
    // Assert
    expect(actualCalls).toEqual([
      'connect',
      'listTopics',
      'create orders.events',
      'listTopics',
      'create payments.events',
    ]);
    expect(mockAdmin.disconnect).not.toHaveBeenCalled();
  });
  it('should retry a failed check on the next call', async () => {
    // Arrange
    mockAdmin.listTopics.mockRejectedValueOnce(new Error('broker down'));
    await expect(
      manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 }),
    ).rejects.toThrow('broker down');
    // Act
    await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
    // Assert
    expect(mockAdmin.listTopics).toHaveBeenCalledTimes(2);
  });
  it('should reconnect after a failed connection attempt', async () => {
    // Arrange
    mockAdmin.connect.mockRejectedValueOnce(new Error('broker down'));
    await expect(
      manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 }),
    ).rejects.toThrow('broker down');
    // Act
    await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
    // Assert
    expect(mockAdmin.connect).toHaveBeenCalledTimes(2);
    expect(mockAdmin.createTopics).toHaveBeenCalledTimes(1);
  });
  describe('onModuleDestroy', () => {
    it('should disconnect an opened admin connection once', async () => {
      // Arrange
      await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
      // Act
      await manager.onModuleDestroy();
      await manager.onModuleDestroy();
      // Assert
      expect(mockAdmin.disconnect).toHaveBeenCalledTimes(1);
    });
    it('should not disconnect when no topic was ever checked', async () => {
      // Arrange
      // Act
      await manager.onModuleDestroy();
      // Assert
      expect(mockAdmin.disconnect).not.toHaveBeenCalled();
    });
  });
});

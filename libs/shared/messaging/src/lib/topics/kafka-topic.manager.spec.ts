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
    expect(mockAdmin.disconnect).toHaveBeenCalledTimes(1);
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
  it('should run checks of different topics one at a time on the shared admin client', async () => {
    // Arrange
    const actualCalls: string[] = [];
    mockAdmin.connect.mockImplementation(async (): Promise<void> => {
      actualCalls.push('connect');
    });
    mockAdmin.disconnect.mockImplementation(async (): Promise<void> => {
      actualCalls.push('disconnect');
    });
    // Act
    await Promise.all([
      manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 }),
      manager.ensureTopic({ topic: 'inventory.events', numPartitions: 3 }),
    ]);
    // Assert
    expect(actualCalls).toEqual([
      'connect',
      'disconnect',
      'connect',
      'disconnect',
    ]);
  });
  it('should retry a failed check and still disconnect', async () => {
    // Arrange
    mockAdmin.listTopics.mockRejectedValueOnce(new Error('broker down'));
    await expect(
      manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 }),
    ).rejects.toThrow('broker down');
    // Act
    await manager.ensureTopic({ topic: 'orders.events', numPartitions: 3 });
    // Assert
    expect(mockAdmin.listTopics).toHaveBeenCalledTimes(2);
    expect(mockAdmin.disconnect).toHaveBeenCalledTimes(2);
  });
});

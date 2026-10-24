import { CommandBus } from '@nestjs/cqrs';
import { RelayOutboxCommand } from '../../application/commands/relay-outbox/relay-outbox.command';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let service: OutboxRelayService;
  beforeEach(() => {
    jest.useFakeTimers();
    mockCommandBus = {
      execute: jest
        .fn()
        .mockResolvedValue({ publishedCount: 0, failedCount: 0 }),
    };
    service = new OutboxRelayService(mockCommandBus as unknown as CommandBus);
    jest
      .spyOn(service['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });
  it('should relay a batch of 50 every second', async () => {
    // Arrange
    service.onApplicationBootstrap();
    // Act
    await jest.advanceTimersByTimeAsync(3_000);
    // Assert
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(3);
    const actualCommand: RelayOutboxCommand =
      mockCommandBus.execute.mock.calls[0][0];
    expect(actualCommand).toBeInstanceOf(RelayOutboxCommand);
    expect(actualCommand.batchSize).toBe(50);
  });
  it('should not overlap runs', async () => {
    // Arrange
    mockCommandBus.execute.mockReturnValue(new Promise((): void => undefined));
    // Act
    void service.executeRelay();
    await service.executeRelay();
    // Assert
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
  });
  it('should log an unexpected failure and keep relaying', async () => {
    // Arrange
    mockCommandBus.execute.mockRejectedValueOnce(new Error('database down'));
    // Act
    await service.executeRelay();
    await service.executeRelay();
    // Assert
    expect(service['logger'].error).toHaveBeenCalledTimes(1);
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(2);
  });
});

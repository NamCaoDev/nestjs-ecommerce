import { CommandBus } from '@nestjs/cqrs';
import { ReleaseExpiredReservationsCommand } from '../../application/commands/release-expired-reservations/release-expired-reservations.command';
import { ReservationSweeperService } from './reservation-sweeper.service';

describe('ReservationSweeperService', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let service: ReservationSweeperService;
  beforeEach(() => {
    jest.useFakeTimers();
    mockCommandBus = {
      execute: jest
        .fn()
        .mockResolvedValue({ expiredCount: 0, releasedCount: 0 }),
    };
    service = new ReservationSweeperService(
      mockCommandBus as unknown as CommandBus,
    );
    jest
      .spyOn(service['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });
  it('should dispatch ReleaseExpiredReservationsCommand every 30 seconds', async () => {
    // Arrange
    service.onApplicationBootstrap();
    // Act
    await jest.advanceTimersByTimeAsync(60_000);
    // Assert
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(2);
    const actualCommand: ReleaseExpiredReservationsCommand =
      mockCommandBus.execute.mock.calls[0][0];
    expect(actualCommand.batchSize).toBe(100);
  });
  it('should not start a sweep while the previous one is running', async () => {
    // Arrange
    mockCommandBus.execute.mockReturnValue(new Promise((): void => undefined));
    // Act
    void service.executeSweep();
    await service.executeSweep();
    // Assert
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
  });
  it('should log a failed sweep and allow the next one', async () => {
    // Arrange
    mockCommandBus.execute.mockRejectedValueOnce(new Error('Redis down'));
    // Act
    await service.executeSweep();
    await service.executeSweep();
    // Assert
    expect(service['logger'].error).toHaveBeenCalledTimes(1);
    expect(mockCommandBus.execute).toHaveBeenCalledTimes(2);
  });
});

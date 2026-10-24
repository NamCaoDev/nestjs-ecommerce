import { AbstractPollingWorker } from './abstract-polling-worker';

/**
 * Worker counting its ticks; a tick can be made to fail or to hang.
 */
class TestWorker extends AbstractPollingWorker {
  public readonly tick: jest.Mock = jest.fn().mockResolvedValue(undefined);

  public constructor() {
    super({
      enabledFlag: 'TEST_WORKER_ENABLED',
      intervalVariable: 'TEST_WORKER_INTERVAL_MS',
      defaultIntervalMs: 1_000,
    });
  }

  protected executeTick(): Promise<void> {
    return this.tick();
  }
}

describe('AbstractPollingWorker', () => {
  let worker: TestWorker;
  beforeEach(() => {
    jest.useFakeTimers();
    worker = new TestWorker();
    jest
      .spyOn(worker['logger'], 'log')
      .mockImplementation((): void => undefined);
    jest
      .spyOn(worker['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    worker.onModuleDestroy();
    jest.useRealTimers();
    delete process.env['TEST_WORKER_ENABLED'];
  });
  it('should tick on its interval', async () => {
    // Arrange
    worker.onApplicationBootstrap();
    // Act
    await jest.advanceTimersByTimeAsync(3_000);
    // Assert
    expect(worker.tick).toHaveBeenCalledTimes(3);
  });
  it('should not start when its flag is false', async () => {
    // Arrange
    process.env['TEST_WORKER_ENABLED'] = 'false';
    worker.onApplicationBootstrap();
    // Act
    await jest.advanceTimersByTimeAsync(3_000);
    // Assert
    expect(worker.tick).not.toHaveBeenCalled();
  });
  it('should never overlap ticks', async () => {
    // Arrange
    worker.tick.mockReturnValue(new Promise((): void => undefined));
    // Act
    void worker.executeRun();
    await worker.executeRun();
    // Assert
    expect(worker.tick).toHaveBeenCalledTimes(1);
  });
  it('should log a failed tick and run the next one', async () => {
    // Arrange
    worker.tick.mockRejectedValueOnce(new Error('Redis down'));
    // Act
    await worker.executeRun();
    await worker.executeRun();
    // Assert
    expect(worker['logger'].error).toHaveBeenCalledWith(
      'Tick failed: Redis down',
    );
    expect(worker.tick).toHaveBeenCalledTimes(2);
  });
});

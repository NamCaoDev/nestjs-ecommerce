import { RedisService } from './redis.service';

/** Stand-in for a constructed client, so the test never opens a socket. */
interface MockRedisClient {
  readonly quit: jest.Mock;
  readonly disconnect: jest.Mock;
}

describe('RedisService', () => {
  describe('onModuleDestroy', () => {
    it('should QUIT gracefully', async () => {
      // Arrange
      const mockClient: MockRedisClient = {
        quit: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn(),
      };
      // Act
      await RedisService.prototype.onModuleDestroy.call(mockClient);
      // Assert
      expect(mockClient.quit).toHaveBeenCalledTimes(1);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });
    it('should close the socket when QUIT fails on a broken connection', async () => {
      // Arrange
      const mockClient: MockRedisClient = {
        quit: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
        disconnect: jest.fn(),
      };
      // Act
      await RedisService.prototype.onModuleDestroy.call(mockClient);
      // Assert
      expect(mockClient.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});

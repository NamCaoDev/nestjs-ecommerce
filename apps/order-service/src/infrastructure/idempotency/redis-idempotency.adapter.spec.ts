import { Result } from '@org/shared-domain';
import { RedisService } from '@org/shared-infrastructure';
import { DuplicateRequestError } from '../../application/errors/duplicate-request.error';
import { RedisIdempotencyAdapter } from './redis-idempotency.adapter';

const INPUT_KEY = 'checkout-42';
const INPUT_CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';
const EXPECTED_REDIS_KEY = `idempotency:order:${INPUT_CUSTOMER_ID}:${INPUT_KEY}`;

describe('RedisIdempotencyAdapter', () => {
  let mockRedis: { readonly set: jest.Mock; readonly eval: jest.Mock };
  let adapter: RedisIdempotencyAdapter;
  beforeEach(() => {
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    adapter = new RedisIdempotencyAdapter(mockRedis as unknown as RedisService);
  });
  describe('acquireLock', () => {
    it('should SET the customer-scoped key to PROCESSING with NX and EX', async () => {
      // Arrange
      const inputTtlSeconds: number = 120;
      // Act
      const actualResult: Result<void, DuplicateRequestError> =
        await adapter.acquireLock({
          customerId: INPUT_CUSTOMER_ID,
          key: INPUT_KEY,
          ttlSeconds: inputTtlSeconds,
        });
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        EXPECTED_REDIS_KEY,
        'PROCESSING',
        'EX',
        inputTtlSeconds,
        'NX',
      );
    });
    it('should fail with DuplicateRequestError when the key already exists', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue(null);
      // Act
      const actualResult: Result<void, DuplicateRequestError> =
        await adapter.acquireLock({
          customerId: INPUT_CUSTOMER_ID,
          key: INPUT_KEY,
          ttlSeconds: 120,
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(DuplicateRequestError);
    });
  });
  describe('markCompleted', () => {
    it('should SET the key to COMPLETED with the long TTL', async () => {
      // Arrange
      const inputTtlSeconds: number = 86_400;
      // Act
      await adapter.markCompleted({
        customerId: INPUT_CUSTOMER_ID,
        key: INPUT_KEY,
        ttlSeconds: inputTtlSeconds,
      });
      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(
        EXPECTED_REDIS_KEY,
        'COMPLETED',
        'EX',
        inputTtlSeconds,
      );
    });
  });
  describe('releaseLock', () => {
    it('should delete the key only while it is PROCESSING, atomically', async () => {
      // Arrange
      const expectedGuardValue: string = 'PROCESSING';
      // Act
      await adapter.releaseLock({
        customerId: INPUT_CUSTOMER_ID,
        key: INPUT_KEY,
      });
      // Assert
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('DEL', KEYS[1])"),
        1,
        EXPECTED_REDIS_KEY,
        expectedGuardValue,
      );
    });
  });
});

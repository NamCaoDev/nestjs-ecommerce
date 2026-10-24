import { RedisService } from '@org/shared-infrastructure';
import { CommitResult } from '../../domain/ports/commit-result.type';
import { ReleaseOutcome } from '../../domain/ports/release-outcome.type';
import { ReservationOutcome } from '../../domain/ports/reservation-outcome.type';
import { StockReservation } from '../../domain/value-objects/stock-reservation.vo';
import { RedisInventoryRepository } from './redis-inventory.repository';

const SKU_A = '0199a7c0-0000-7000-8000-0000000000a1';
const SKU_B = '0199a7c0-0000-7000-8000-0000000000a2';
const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const RESERVATION_KEY = 'c1:checkout-42';
const EXPIRATIONS_KEY = 'inventory:reservation_expirations';
const INPUT_RESERVATION: StockReservation = StockReservation.create({
  reservationKey: RESERVATION_KEY,
  orderId: ORDER_ID,
  items: [
    { skuId: SKU_A, quantity: 2 },
    { skuId: SKU_B, quantity: 1 },
  ],
}).getValue();
const STORED_HASH: Record<string, string> = {
  status: 'RESERVED',
  orderId: ORDER_ID,
  items: JSON.stringify(INPUT_RESERVATION.items),
};

describe('RedisInventoryRepository', () => {
  let mockRedis: {
    readonly defineCommand: jest.Mock;
    readonly atomicReserve: jest.Mock;
    readonly atomicRelease: jest.Mock;
    readonly atomicCommit: jest.Mock;
    readonly get: jest.Mock;
    readonly hgetall: jest.Mock;
    readonly time: jest.Mock;
    readonly zrangebyscore: jest.Mock;
    readonly zrem: jest.Mock;
  };
  let repository: RedisInventoryRepository;
  beforeEach(() => {
    mockRedis = {
      defineCommand: jest.fn(),
      atomicReserve: jest.fn().mockResolvedValue(1),
      atomicRelease: jest.fn().mockResolvedValue(1),
      atomicCommit: jest.fn().mockResolvedValue([1, 0]),
      get: jest.fn().mockResolvedValue(RESERVATION_KEY),
      hgetall: jest.fn().mockResolvedValue(STORED_HASH),
      time: jest.fn().mockResolvedValue(['1792843000', '500000']),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zrem: jest.fn().mockResolvedValue(1),
    };
    repository = new RedisInventoryRepository(
      mockRedis as unknown as RedisService,
    );
  });
  it('should register the three Lua scripts as custom commands', () => {
    // Arrange
    const expectedCommands: string[] = [
      'atomicReserve',
      'atomicRelease',
      'atomicCommit',
    ];
    // Act
    const actualCommands: string[] = mockRedis.defineCommand.mock.calls.map(
      (call: unknown[]): string => call[0] as string,
    );
    // Assert
    expect(actualCommands).toEqual(expectedCommands);
    expect(mockRedis.defineCommand.mock.calls[2][1].lua).toContain(
      "'COMMITTED'",
    );
  });
  describe('reserve', () => {
    it('should pass the reservation, expiry queue, order index and stock keys, then timings, identity, items and quantities', async () => {
      // Arrange
      const expectedItemsJson: string = JSON.stringify(INPUT_RESERVATION.items);
      // Act
      await repository.reserve(INPUT_RESERVATION);
      // Assert
      expect(mockRedis.atomicReserve).toHaveBeenCalledWith(
        5,
        `inventory:reservation:${RESERVATION_KEY}`,
        EXPIRATIONS_KEY,
        `inventory:reservation_order:${ORDER_ID}`,
        `inventory:stock:${SKU_A}`,
        `inventory:stock:${SKU_B}`,
        900,
        604_800,
        RESERVATION_KEY,
        ORDER_ID,
        expectedItemsJson,
        2,
        1,
      );
    });
    it.each([
      { inputReply: 1, expectedOutcome: 'RESERVED' },
      { inputReply: 0, expectedOutcome: 'INSUFFICIENT_STOCK' },
      { inputReply: 2, expectedOutcome: 'ALREADY_RESERVED' },
      { inputReply: 3, expectedOutcome: 'STOCK_NOT_LOADED' },
    ])(
      'should map reply $inputReply to $expectedOutcome',
      async ({ inputReply, expectedOutcome }) => {
        // Arrange
        mockRedis.atomicReserve.mockResolvedValue(inputReply);
        // Act
        const actualOutcome: ReservationOutcome =
          await repository.reserve(INPUT_RESERVATION);
        // Assert
        expect(actualOutcome).toBe(expectedOutcome);
      },
    );
  });
  describe('release', () => {
    it.each([
      { inputReply: 1, expectedOutcome: 'RELEASED' },
      { inputReply: 0, expectedOutcome: 'NOT_FOUND' },
    ])(
      'should unschedule the expiry and map reply $inputReply to $expectedOutcome',
      async ({ inputReply, expectedOutcome }) => {
        // Arrange
        mockRedis.atomicRelease.mockResolvedValue(inputReply);
        // Act
        const actualOutcome: ReleaseOutcome =
          await repository.release(INPUT_RESERVATION);
        // Assert
        expect(actualOutcome).toBe(expectedOutcome);
        expect(mockRedis.atomicRelease).toHaveBeenCalledWith(
          4,
          `inventory:reservation:${RESERVATION_KEY}`,
          EXPIRATIONS_KEY,
          `inventory:stock:${SKU_A}`,
          `inventory:stock:${SKU_B}`,
          RESERVATION_KEY,
          2,
          1,
        );
      },
    );
  });
  describe('commit', () => {
    it.each([
      {
        inputReply: [1, 0],
        expectedOutcome: 'COMMITTED',
        expectedReacquired: false,
      },
      {
        inputReply: [2, 1],
        expectedOutcome: 'ALREADY_COMMITTED',
        expectedReacquired: true,
      },
      {
        inputReply: [3, 1],
        expectedOutcome: 'REACQUIRED_AND_COMMITTED',
        expectedReacquired: true,
      },
      {
        inputReply: [0, 0],
        expectedOutcome: 'EXPIRED_AND_OUT_OF_STOCK',
        expectedReacquired: false,
      },
      {
        inputReply: [4, 0],
        expectedOutcome: 'STOCK_NOT_LOADED',
        expectedReacquired: false,
      },
    ])(
      'should map reply $inputReply to $expectedOutcome',
      async ({ inputReply, expectedOutcome, expectedReacquired }) => {
        // Arrange
        mockRedis.atomicCommit.mockResolvedValue(inputReply);
        // Act
        const actualResult: CommitResult =
          await repository.commit(INPUT_RESERVATION);
        // Assert
        expect(actualResult).toEqual({
          outcome: expectedOutcome,
          isReacquired: expectedReacquired,
        });
        expect(mockRedis.atomicCommit).toHaveBeenCalledWith(
          4,
          `inventory:reservation:${RESERVATION_KEY}`,
          EXPIRATIONS_KEY,
          `inventory:stock:${SKU_A}`,
          `inventory:stock:${SKU_B}`,
          RESERVATION_KEY,
          604_800,
          ORDER_ID,
          JSON.stringify(INPUT_RESERVATION.items),
          2,
          1,
        );
      },
    );
  });
  describe('findByOrderId', () => {
    it('should resolve the order index and rebuild the stored reservation', async () => {
      // Arrange
      const inputOrderId: string = ORDER_ID;
      // Act
      const actualReservation: StockReservation | undefined =
        await repository.findByOrderId(inputOrderId);
      // Assert
      expect(mockRedis.get).toHaveBeenCalledWith(
        `inventory:reservation_order:${ORDER_ID}`,
      );
      expect(actualReservation?.reservationKey).toBe(RESERVATION_KEY);
      expect(actualReservation?.items).toEqual(INPUT_RESERVATION.items);
    });
    it('should return undefined when the order has no reservation', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      // Act
      const actualReservation: StockReservation | undefined =
        await repository.findByOrderId(ORDER_ID);
      // Assert
      expect(actualReservation).toBeUndefined();
    });
  });
  describe('findExpired', () => {
    it('should read due members by the Redis clock and drop members whose hash is gone', async () => {
      // Arrange
      mockRedis.zrangebyscore.mockResolvedValue([RESERVATION_KEY, 'c1:gone']);
      mockRedis.hgetall.mockImplementation(
        (key: string): Promise<Record<string, string>> =>
          Promise.resolve(key.endsWith('c1:gone') ? {} : STORED_HASH),
      );
      // Act
      const actualReservations: StockReservation[] =
        await repository.findExpired(100);
      // Assert
      expect(mockRedis.zrangebyscore).toHaveBeenCalledWith(
        EXPIRATIONS_KEY,
        0,
        1_792_843_000_500,
        'LIMIT',
        0,
        100,
      );
      expect(actualReservations).toHaveLength(1);
      expect(actualReservations[0].reservationKey).toBe(RESERVATION_KEY);
      expect(mockRedis.zrem).toHaveBeenCalledWith(EXPIRATIONS_KEY, 'c1:gone');
    });
  });
});

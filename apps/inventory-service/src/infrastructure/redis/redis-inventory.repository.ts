import { Injectable } from '@nestjs/common';
import { RedisService } from '@org/shared-infrastructure';
import { CommitOutcome } from '../../domain/ports/commit-outcome.type';
import { CommitResult } from '../../domain/ports/commit-result.type';
import { ReleaseOutcome } from '../../domain/ports/release-outcome.type';
import { ReservationOutcome } from '../../domain/ports/reservation-outcome.type';
import { StockReservationStorePort } from '../../domain/ports/stock-reservation-store.port';
import { ReservationLine } from '../../domain/value-objects/reservation-line.type';
import { StockReservation } from '../../domain/value-objects/stock-reservation.vo';
import { InventoryLuaCommands } from './inventory-lua-commands.interface';
import { InventoryRedisKeys } from './inventory-redis-keys';
import { loadLuaScript } from './load-lua-script.util';
import { ReservationTimingConfig } from './reservation-timing.config';

/** Replies of `atomic_reserve.lua`. */
const RESERVE_REPLY_TO_OUTCOME: Readonly<Record<number, ReservationOutcome>> = {
  0: 'INSUFFICIENT_STOCK',
  1: 'RESERVED',
  2: 'ALREADY_RESERVED',
  3: 'STOCK_NOT_LOADED',
};

/** Replies of `atomic_release.lua`. */
const RELEASE_REPLY_TO_OUTCOME: Readonly<Record<number, ReleaseOutcome>> = {
  0: 'NOT_FOUND',
  1: 'RELEASED',
};

/** First element of the `atomic_commit.lua` reply. */
const COMMIT_REPLY_TO_OUTCOME: Readonly<Record<number, CommitOutcome>> = {
  0: 'EXPIRED_AND_OUT_OF_STOCK',
  1: 'COMMITTED',
  2: 'ALREADY_COMMITTED',
  3: 'REACQUIRED_AND_COMMITTED',
  4: 'STOCK_NOT_LOADED',
};

/** Second element of the `atomic_commit.lua` reply when the stock was re-acquired. */
const REACQUIRED_FLAG = 1;

/** Milliseconds per second and microseconds per millisecond, to read Redis `TIME`. */
const MILLISECONDS_PER_SECOND = 1_000;
const MICROSECONDS_PER_MILLISECOND = 1_000;

/** Fields of a reservation hash, as returned by `HGETALL` (empty when the key is missing). */
interface ReservationHash {
  readonly status?: string;
  readonly orderId?: string;
  readonly items?: string;
}

/**
 * Redis implementation of {@link StockReservationStorePort}. Every state change runs inside one
 * Lua script, so concurrent checkouts can never oversell (CLAUDE.md §4.1); expiry is driven by the
 * `inventory:reservation_expirations` ZSET and handled by the sweeper.
 */
@Injectable()
export class RedisInventoryRepository implements StockReservationStorePort {
  private readonly commands: InventoryLuaCommands;

  /**
   * Registers the Lua scripts as custom commands on the shared client.
   *
   * @param redis - Shared Redis client.
   */
  public constructor(private readonly redis: RedisService) {
    redis.defineCommand('atomicReserve', {
      lua: loadLuaScript('atomic_reserve.lua'),
    });
    redis.defineCommand('atomicRelease', {
      lua: loadLuaScript('atomic_release.lua'),
    });
    redis.defineCommand('atomicCommit', {
      lua: loadLuaScript('atomic_commit.lua'),
    });
    this.commands = redis as unknown as InventoryLuaCommands;
  }

  /**
   * @param reservation - Reservation to apply.
   * @returns The outcome reported by `atomic_reserve.lua`.
   */
  public async reserve(
    reservation: StockReservation,
  ): Promise<ReservationOutcome> {
    const reply: number = await this.commands.atomicReserve(
      reservation.items.length + 3,
      InventoryRedisKeys.toReservationKey(reservation.reservationKey),
      InventoryRedisKeys.reservationExpirationsKey,
      InventoryRedisKeys.toReservationOrderKey(reservation.orderId),
      ...RedisInventoryRepository.toStockKeys(reservation),
      ReservationTimingConfig.ttlSeconds,
      ReservationTimingConfig.retentionSeconds,
      reservation.reservationKey,
      reservation.orderId,
      JSON.stringify(reservation.items),
      ...RedisInventoryRepository.toQuantities(reservation),
    );
    return RESERVE_REPLY_TO_OUTCOME[reply];
  }

  /**
   * @param reservation - Reservation to undo.
   * @returns The outcome reported by `atomic_release.lua`.
   */
  public async release(reservation: StockReservation): Promise<ReleaseOutcome> {
    const reply: number = await this.commands.atomicRelease(
      reservation.items.length + 2,
      InventoryRedisKeys.toReservationKey(reservation.reservationKey),
      InventoryRedisKeys.reservationExpirationsKey,
      ...RedisInventoryRepository.toStockKeys(reservation),
      reservation.reservationKey,
      ...RedisInventoryRepository.toQuantities(reservation),
    );
    return RELEASE_REPLY_TO_OUTCOME[reply];
  }

  /**
   * @param reservation - Reservation key and lines to ship.
   * @returns The outcome reported by `atomic_commit.lua`.
   */
  public async commit(reservation: StockReservation): Promise<CommitResult> {
    const [code, reacquiredFlag]: number[] = await this.commands.atomicCommit(
      reservation.items.length + 2,
      InventoryRedisKeys.toReservationKey(reservation.reservationKey),
      InventoryRedisKeys.reservationExpirationsKey,
      ...RedisInventoryRepository.toStockKeys(reservation),
      reservation.reservationKey,
      ReservationTimingConfig.retentionSeconds,
      reservation.orderId,
      JSON.stringify(reservation.items),
      ...RedisInventoryRepository.toQuantities(reservation),
    );
    return {
      outcome: COMMIT_REPLY_TO_OUTCOME[code],
      isReacquired: reacquiredFlag === REACQUIRED_FLAG,
    };
  }

  /**
   * @param orderId - Logical order identifier.
   * @returns The stored reservation of the order, or `undefined` when none exists.
   */
  public async findByOrderId(
    orderId: string,
  ): Promise<StockReservation | undefined> {
    const reservationKey: string | null = await this.redis.get(
      InventoryRedisKeys.toReservationOrderKey(orderId),
    );
    if (reservationKey === null) {
      return undefined;
    }
    return this.findByReservationKey(reservationKey);
  }

  /**
   * Reads due members of the expiry queue, using the Redis clock like the scripts do.
   * Members whose hash no longer exists are removed from the queue and skipped.
   *
   * @param limit - Maximum number of reservations to return.
   * @returns Expired reservations, oldest first.
   */
  public async findExpired(limit: number): Promise<StockReservation[]> {
    const [seconds, microseconds]: number[] = await this.redis.time();
    const nowMs: number =
      Number(seconds) * MILLISECONDS_PER_SECOND +
      Math.floor(Number(microseconds) / MICROSECONDS_PER_MILLISECOND);
    const reservationKeys: string[] = await this.redis.zrangebyscore(
      InventoryRedisKeys.reservationExpirationsKey,
      0,
      nowMs,
      'LIMIT',
      0,
      limit,
    );
    const reservations: (StockReservation | undefined)[] = await Promise.all(
      reservationKeys.map(
        (reservationKey: string): Promise<StockReservation | undefined> =>
          this.findQueuedReservation(reservationKey),
      ),
    );
    return reservations.filter(
      (reservation: StockReservation | undefined): boolean =>
        reservation !== undefined,
    ) as StockReservation[];
  }

  /**
   * @returns The reservation stored under the key, or `undefined` when its hash is gone.
   */
  private async findByReservationKey(
    reservationKey: string,
  ): Promise<StockReservation | undefined> {
    const hash: ReservationHash = await this.redis.hgetall(
      InventoryRedisKeys.toReservationKey(reservationKey),
    );
    if (hash.orderId === undefined || hash.items === undefined) {
      return undefined;
    }
    return StockReservation.create({
      reservationKey,
      orderId: hash.orderId,
      items: JSON.parse(hash.items) as ReservationLine[],
    }).getValue();
  }

  /**
   * Loads a queued reservation, dropping a stale queue member whose hash no longer exists.
   */
  private async findQueuedReservation(
    reservationKey: string,
  ): Promise<StockReservation | undefined> {
    const reservation: StockReservation | undefined =
      await this.findByReservationKey(reservationKey);
    if (reservation === undefined) {
      await this.redis.zrem(
        InventoryRedisKeys.reservationExpirationsKey,
        reservationKey,
      );
    }
    return reservation;
  }

  /**
   * @returns One stock key per line.
   */
  private static toStockKeys(reservation: StockReservation): string[] {
    return reservation.items.map((item: ReservationLine): string =>
      InventoryRedisKeys.toStockKey(item.skuId),
    );
  }

  /**
   * @returns The quantity of each line, in the order of {@link toStockKeys}.
   */
  private static toQuantities(reservation: StockReservation): number[] {
    return reservation.items.map(
      (item: ReservationLine): number => item.quantity,
    );
  }
}

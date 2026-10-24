import { Injectable } from '@nestjs/common';
import { RedisService } from '@org/shared-infrastructure';
import { ApplyRestockInput } from '../../application/ports/apply-restock.input';
import { RestockApplyOutcome } from '../../application/ports/restock-apply-outcome.type';
import { StockCachePort } from '../../application/ports/stock-cache.port';
import { StockCounters } from '../../application/ports/stock-counters.type';
import { StockSnapshot } from '../../application/ports/stock-snapshot.type';
import { InventoryRedisKeys } from './inventory-redis-keys';
import { loadLuaScript } from './load-lua-script.util';

/** Fields of a stock hash, as returned by `HGETALL` (empty when the key is missing). */
interface StockHash {
  readonly total?: string;
  readonly reserved?: string;
}

/** Custom commands registered for `warm_stock.lua` and `apply_restock.lua`. */
interface StockCacheCommands {
  warmStock(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): Promise<number>;
  applyRestock(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): Promise<number>;
}

/** Pipeline exposing the custom `warmStock` command. */
interface WarmStockPipeline {
  warmStock(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): WarmStockPipeline;
  exec(): Promise<[Error | null, unknown][] | null>;
}

/** Reply of `warm_stock.lua` when it restored the entry. */
const RESTORED = 1;

/** Replies of `apply_restock.lua`. */
const APPLY_REPLY_TO_OUTCOME: Readonly<Record<number, RestockApplyOutcome>> = {
  0: 'SKU_NOT_CACHED',
  1: 'APPLIED',
  2: 'ALREADY_APPLIED',
};

/**
 * Retention of applied-receipt markers: 30 days, far longer than any outbox backlog should last;
 * an event still pending after that could be applied twice and must be investigated.
 */
const APPLIED_MARKER_TTL_SECONDS = 2_592_000;

/**
 * Redis implementation of {@link StockCachePort} on the `inventory:stock:{skuId}` hashes.
 */
@Injectable()
export class RedisStockCacheAdapter implements StockCachePort {
  private readonly commands: StockCacheCommands;

  /**
   * Registers `warm_stock.lua` and `apply_restock.lua` as custom commands on the shared client.
   *
   * @param redis - Shared Redis client.
   */
  public constructor(private readonly redis: RedisService) {
    redis.defineCommand('warmStock', { lua: loadLuaScript('warm_stock.lua') });
    redis.defineCommand('applyRestock', {
      lua: loadLuaScript('apply_restock.lua'),
    });
    this.commands = redis as unknown as StockCacheCommands;
  }

  /**
   * @param skuId - SKU UUID.
   * @returns The counters, or `undefined` when the hash is missing.
   */
  public async findCounters(skuId: string): Promise<StockCounters | undefined> {
    const hash: StockHash = await this.redis.hgetall(
      InventoryRedisKeys.toStockKey(skuId),
    );
    if (hash.total === undefined) {
      return undefined;
    }
    return {
      skuId,
      totalQuantity: Number(hash.total),
      reservedQuantity: Number(hash.reserved ?? 0),
    };
  }

  /**
   * @param snapshot - Counters and pending receipts read from PostgreSQL.
   */
  public async saveCountersIfAbsent(snapshot: StockSnapshot): Promise<void> {
    await this.commands.warmStock(
      ...RedisStockCacheAdapter.toWarmStockArguments(snapshot),
    );
  }

  /**
   * Runs `warm_stock.lua` for every SKU in a single pipeline.
   *
   * @param snapshots - Snapshots read from PostgreSQL.
   * @returns How many entries were missing and restored.
   * @throws When a script fails.
   */
  public async saveManyCountersIfAbsent(
    snapshots: readonly StockSnapshot[],
  ): Promise<number> {
    const pipeline: WarmStockPipeline =
      this.redis.pipeline() as unknown as WarmStockPipeline;
    snapshots.forEach((snapshot: StockSnapshot): void => {
      pipeline.warmStock(
        ...RedisStockCacheAdapter.toWarmStockArguments(snapshot),
      );
    });
    const replies: [Error | null, unknown][] = (await pipeline.exec()) ?? [];
    const failure: [Error | null, unknown] | undefined = replies.find(
      ([err]: [Error | null, unknown]): boolean => err !== null,
    );
    if (failure !== undefined) {
      throw failure[0];
    }
    return replies.filter(
      ([, reply]: [Error | null, unknown]): boolean => reply === RESTORED,
    ).length;
  }

  /**
   * @param input - Event id, SKU and units received.
   * @returns The outcome reported by `apply_restock.lua`.
   */
  public async applyRestock({
    eventId,
    skuId,
    quantity,
  }: ApplyRestockInput): Promise<RestockApplyOutcome> {
    const reply: number = await this.commands.applyRestock(
      2,
      InventoryRedisKeys.toStockKey(skuId),
      InventoryRedisKeys.toAppliedRestockKey(eventId),
      quantity,
      APPLIED_MARKER_TTL_SECONDS,
    );
    return APPLY_REPLY_TO_OUTCOME[reply];
  }

  /**
   * @returns Key count, stock key, one marker key per pending receipt, counters and marker retention.
   */
  private static toWarmStockArguments(
    snapshot: StockSnapshot,
  ): [number, ...(string | number)[]] {
    return [
      snapshot.pendingRestockEventIds.length + 1,
      InventoryRedisKeys.toStockKey(snapshot.skuId),
      ...snapshot.pendingRestockEventIds.map((eventId: string): string =>
        InventoryRedisKeys.toAppliedRestockKey(eventId),
      ),
      snapshot.totalQuantity,
      snapshot.reservedQuantity,
      APPLIED_MARKER_TTL_SECONDS,
    ];
  }
}

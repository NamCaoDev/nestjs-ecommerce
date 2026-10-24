import { Injectable } from '@nestjs/common';
import { RedisService } from '@org/shared-infrastructure';
import { StockCachePort } from '../../application/ports/stock-cache.port';
import { StockCounters } from '../../application/ports/stock-counters.type';
import { InventoryRedisKeys } from './inventory-redis-keys';
import { loadLuaScript } from './load-lua-script.util';

/** Fields of a stock hash, as returned by `HGETALL` (empty when the key is missing). */
interface StockHash {
  readonly total?: string;
  readonly reserved?: string;
}

/** Custom command registered for `warm_stock.lua`. */
interface WarmStockCommand {
  warmStock(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): Promise<number>;
}

/**
 * Redis implementation of {@link StockCachePort} on the `inventory:stock:{skuId}` hashes.
 */
@Injectable()
export class RedisStockCacheAdapter implements StockCachePort {
  private readonly commands: WarmStockCommand;

  /**
   * Registers `warm_stock.lua` as a custom command on the shared client.
   *
   * @param redis - Shared Redis client.
   */
  public constructor(private readonly redis: RedisService) {
    redis.defineCommand('warmStock', { lua: loadLuaScript('warm_stock.lua') });
    this.commands = redis as unknown as WarmStockCommand;
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
   * @param counters - Counters read from PostgreSQL.
   */
  public async saveCountersIfAbsent({
    skuId,
    totalQuantity,
    reservedQuantity,
  }: StockCounters): Promise<void> {
    await this.commands.warmStock(
      1,
      InventoryRedisKeys.toStockKey(skuId),
      totalQuantity,
      reservedQuantity,
    );
  }
}

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { STOCK_RESTOCKED_EVENT_TYPE } from '../../events/stock-restocked.event-type';
import { StockRestockedPayload } from '../../events/stock-restocked.payload';
import type { InventoryOutboxPort } from '../../ports/inventory-outbox.port';
import { INVENTORY_OUTBOX_PORT } from '../../ports/inventory-outbox.token';
import { OutboxRecord } from '../../ports/outbox-record.type';
import type { StockCachePort } from '../../ports/stock-cache.port';
import { STOCK_CACHE_PORT } from '../../ports/stock-cache.token';
import { RelayInventoryOutboxCommand } from './relay-inventory-outbox.command';
import { RelayInventoryOutboxOutput } from './relay-inventory-outbox.output';

/**
 * Applies pending `stock.restocked` events to the Redis totals, then marks them `PUBLISHED`.
 *
 * Applying is idempotent per event (atomic marker in Redis), so the at-least-once relay can never add
 * a receipt twice. Events are applied in order until Redis fails: the applied ones are published, the
 * rest go back to `PENDING` and are retried on the next run once Redis is reachable.
 */
@CommandHandler(RelayInventoryOutboxCommand)
export class RelayInventoryOutboxHandler implements ICommandHandler<
  RelayInventoryOutboxCommand,
  RelayInventoryOutboxOutput
> {
  private readonly logger: Logger = new Logger(
    RelayInventoryOutboxHandler.name,
  );

  /**
   * @param outbox - Inventory transactional outbox.
   * @param stockCache - Redis counters.
   */
  public constructor(
    @Inject(INVENTORY_OUTBOX_PORT) private readonly outbox: InventoryOutboxPort,
    @Inject(STOCK_CACHE_PORT) private readonly stockCache: StockCachePort,
  ) {}

  /**
   * @param command - Batch size of the run.
   * @returns How many events were published or returned to `PENDING`.
   */
  public async execute(
    command: RelayInventoryOutboxCommand,
  ): Promise<RelayInventoryOutboxOutput> {
    const events: OutboxRecord[] = await this.outbox.claimPendingBatch(
      command.batchSize,
    );
    const appliedIds: string[] = await this.executeApply(events);
    const failedIds: string[] = events
      .map((event: OutboxRecord): string => event.id)
      .filter((id: string): boolean => !appliedIds.includes(id));
    await this.outbox.markPublished({
      ids: appliedIds,
      publishedAt: Date.now(),
    });
    return { publishedCount: appliedIds.length, failedCount: failedIds.length };
  }

  /**
   * Applies events one by one and stops at the first failure, which returns it and every later event
   * to `PENDING` with the reason.
   *
   * @returns Ids of the events that are applied (now or earlier).
   */
  private async executeApply(
    events: readonly OutboxRecord[],
  ): Promise<string[]> {
    const appliedIds: string[] = [];
    for (const event of events) {
      try {
        await this.executeApplyOne(event);
        appliedIds.push(event.id);
      } catch (err: unknown) {
        const reason: string = err instanceof Error ? err.message : String(err);
        const pendingIds: string[] = events
          .slice(appliedIds.length)
          .map((pending: OutboxRecord): string => pending.id);
        this.logger.warn(
          `Inventory outbox relay stopped at event ${event.id}: ${reason}`,
        );
        await this.outbox.markFailed({ ids: pendingIds, error: reason });
        return appliedIds;
      }
    }
    return appliedIds;
  }

  /**
   * Applies one event to Redis.
   *
   * @throws {Error} For an event type this relay does not handle, or when Redis fails.
   */
  private async executeApplyOne(event: OutboxRecord): Promise<void> {
    if (event.eventType !== STOCK_RESTOCKED_EVENT_TYPE) {
      throw new Error(`No handler for outbox event type ${event.eventType}`);
    }
    const payload: StockRestockedPayload =
      event.payload as unknown as StockRestockedPayload;
    await this.stockCache.applyRestock({
      eventId: event.id,
      skuId: payload.skuId,
      quantity: payload.additionalQuantity,
    });
  }
}

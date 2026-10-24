import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  INVENTORY_EVENT_TYPES,
  STOCK_RESERVATION_FAILURE_REASONS,
  StockReservationFailedPayload,
} from '@org/contracts';
import { DomainError, Result } from '@org/shared-domain';
import { randomUUID } from 'node:crypto';
import { CommitResult } from '../../../domain/ports/commit-result.type';
import type { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { STOCK_LEDGER_REPOSITORY_PORT } from '../../../domain/ports/stock-ledger-repository.token';
import type { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { STOCK_RESERVATION_STORE_PORT } from '../../../domain/ports/stock-reservation-store.token';
import { ReservationLine } from '../../../domain/value-objects/reservation-line.type';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import type { InventoryEventPublisherPort } from '../../ports/inventory-event-publisher.port';
import { INVENTORY_EVENT_PUBLISHER_PORT } from '../../ports/inventory-event-publisher.token';
import { StockCacheWarmer } from '../../services/stock-cache-warmer.service';
import { CommitStockCommand } from './commit-stock.command';

/** Reservation key of a commit made without a live reservation; also its idempotency marker. */
const LATE_COMMIT_KEY_PREFIX = 'order:';

/**
 * Ships the stock of a paid order (`payment.succeeded`):
 * - a live reservation is committed; an expired one is re-acquired if the stock is still available;
 * - when the stock is gone, `stock.reservation_failed` is published so the order gets cancelled;
 * - the `COMMITTED` ledger entry is reconciled on every shipped outcome, including redeliveries,
 *   so a crash between Redis and PostgreSQL never leaves the ledger behind.
 * Safe to repeat: Redis and the ledger both deduplicate by order. On a cold cache the missing counters
 * are restored from PostgreSQL and the commit is retried once, so an order is never cancelled because
 * Redis lost its data.
 */
@CommandHandler(CommitStockCommand)
export class CommitStockHandler implements ICommandHandler<
  CommitStockCommand,
  Result<void, DomainError>
> {
  private readonly logger: Logger = new Logger(CommitStockHandler.name);

  /**
   * @param reservationStore - Atomic Redis store.
   * @param stockLedger - Durable ledger.
   * @param eventPublisher - Inventory integration events.
   * @param stockCacheWarmer - Restores missing Redis counters from PostgreSQL.
   */
  public constructor(
    @Inject(STOCK_RESERVATION_STORE_PORT)
    private readonly reservationStore: StockReservationStorePort,
    @Inject(STOCK_LEDGER_REPOSITORY_PORT)
    private readonly stockLedger: StockLedgerRepositoryPort,
    @Inject(INVENTORY_EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: InventoryEventPublisherPort,
    private readonly stockCacheWarmer: StockCacheWarmer,
  ) {}

  /**
   * @param command - Paid order and its lines.
   * @returns Success, or an `InvalidReservationError` when the event lines are malformed.
   */
  public async execute(
    command: CommitStockCommand,
  ): Promise<Result<void, DomainError>> {
    const reservationResult: Result<StockReservation, DomainError> =
      await this.buildReservation(command);
    if (reservationResult.isFailure) {
      return Result.fail(reservationResult.getError());
    }
    const reservation: StockReservation = reservationResult.getValue();
    const { outcome, isReacquired }: CommitResult =
      await this.commitWithWarmUp(reservation);
    if (outcome === 'EXPIRED_AND_OUT_OF_STOCK') {
      await this.dispatchReservationFailed(reservation);
      return Result.ok();
    }
    if (outcome === 'REACQUIRED_AND_COMMITTED') {
      this.logger.warn(
        `Reservation of order ${command.orderId} had expired; stock was re-acquired and shipped.`,
      );
    }
    await this.saveCommittedMovement({ reservation, isReacquired });
    return Result.ok();
  }

  /**
   * Uses the stored reservation when it still exists; otherwise the event lines under a
   * per-order key, which also deduplicates a late commit.
   */
  private async buildReservation(
    command: CommitStockCommand,
  ): Promise<Result<StockReservation, DomainError>> {
    const storedReservation: StockReservation | undefined =
      await this.reservationStore.findByOrderId(command.orderId);
    return StockReservation.create({
      reservationKey:
        storedReservation?.reservationKey ??
        `${LATE_COMMIT_KEY_PREFIX}${command.orderId}`,
      orderId: command.orderId,
      items: storedReservation?.items ?? command.items,
    });
  }

  /**
   * Records the `COMMITTED` movement unless the ledger already holds it for this order.
   */
  private async saveCommittedMovement({
    reservation,
    isReacquired,
  }: {
    readonly reservation: StockReservation;
    readonly isReacquired: boolean;
  }): Promise<void> {
    const isRecorded: boolean = await this.stockLedger.hasMovement({
      orderId: reservation.orderId,
      actionType: 'COMMITTED',
    });
    if (isRecorded) {
      return;
    }
    await this.stockLedger.recordMovement({
      actionType: 'COMMITTED',
      reservation,
      isReacquired,
    });
  }

  /**
   * Publishes `stock.reservation_failed`. Nothing was changed locally, so a failed publication is
   * simply retried through the redelivery of `payment.succeeded`.
   */
  private async dispatchReservationFailed(
    reservation: StockReservation,
  ): Promise<void> {
    this.logger.warn(
      `Order ${reservation.orderId}: reservation expired and stock is gone; publishing ${INVENTORY_EVENT_TYPES.RESERVATION_FAILED}.`,
    );
    const payload: StockReservationFailedPayload = {
      orderId: reservation.orderId,
      items: reservation.items,
      reason: STOCK_RESERVATION_FAILURE_REASONS.EXPIRED_OUT_OF_STOCK,
    };
    await this.eventPublisher.publish({
      eventId: randomUUID(),
      eventType: INVENTORY_EVENT_TYPES.RESERVATION_FAILED,
      aggregateId: reservation.orderId,
      occurredAt: Date.now(),
      payload,
    });
  }

  /**
   * Commits; when a SKU has no Redis counters, restores them from PostgreSQL and retries once.
   * A SKU still missing afterwards is unknown to both stores, so its stock cannot be shipped.
   */
  private async commitWithWarmUp(
    reservation: StockReservation,
  ): Promise<CommitResult> {
    const result: CommitResult =
      await this.reservationStore.commit(reservation);
    if (result.outcome !== 'STOCK_NOT_LOADED') {
      return result;
    }
    await this.stockCacheWarmer.warmSkus(
      reservation.items.map((item: ReservationLine): string => item.skuId),
    );
    const retriedResult: CommitResult =
      await this.reservationStore.commit(reservation);
    return retriedResult.outcome === 'STOCK_NOT_LOADED'
      ? { outcome: 'EXPIRED_AND_OUT_OF_STOCK', isReacquired: false }
      : retriedResult;
  }
}

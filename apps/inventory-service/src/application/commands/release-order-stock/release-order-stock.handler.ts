import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { ReleaseOutcome } from '../../../domain/ports/release-outcome.type';
import type { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { STOCK_LEDGER_REPOSITORY_PORT } from '../../../domain/ports/stock-ledger-repository.token';
import type { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { STOCK_RESERVATION_STORE_PORT } from '../../../domain/ports/stock-reservation-store.token';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { ReleaseOrderStockCommand } from './release-order-stock.command';

/**
 * Returns the stock of an unpaid order (`payment.failed`) immediately instead of waiting for the
 * reservation to expire: `atomic_release.lua` on the order's reservation, then a `RELEASED` ledger
 * entry. Idempotent: a reservation that is gone (expired, already released) or committed is left
 * alone, so a redelivered event changes nothing.
 */
@CommandHandler(ReleaseOrderStockCommand)
export class ReleaseOrderStockHandler implements ICommandHandler<
  ReleaseOrderStockCommand,
  Result<void, DomainError>
> {
  /**
   * @param reservationStore - Atomic Redis store.
   * @param stockLedger - Durable ledger.
   */
  public constructor(
    @Inject(STOCK_RESERVATION_STORE_PORT)
    private readonly reservationStore: StockReservationStorePort,
    @Inject(STOCK_LEDGER_REPOSITORY_PORT)
    private readonly stockLedger: StockLedgerRepositoryPort,
  ) {}

  /**
   * @param command - Unpaid order.
   * @returns Success, whether or not stock was still held.
   */
  public async execute(
    command: ReleaseOrderStockCommand,
  ): Promise<Result<void, DomainError>> {
    const reservation: StockReservation | undefined =
      await this.reservationStore.findByOrderId(command.orderId);
    if (reservation === undefined) {
      return Result.ok();
    }
    const outcome: ReleaseOutcome =
      await this.reservationStore.release(reservation);
    if (outcome === 'RELEASED') {
      await this.stockLedger.recordMovement({
        actionType: 'RELEASED',
        reservation,
      });
    }
    return Result.ok();
  }
}

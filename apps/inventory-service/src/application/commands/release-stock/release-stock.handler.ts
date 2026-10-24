import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { ReleaseOutcome } from '../../../domain/ports/release-outcome.type';
import type { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { STOCK_LEDGER_REPOSITORY_PORT } from '../../../domain/ports/stock-ledger-repository.token';
import type { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { STOCK_RESERVATION_STORE_PORT } from '../../../domain/ports/stock-reservation-store.token';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { ReleaseStockCommand } from './release-stock.command';

/**
 * Releases a reservation atomically on Redis, then records the movement in PostgreSQL.
 * Idempotent: an unknown, already released or expired reservation succeeds without effect.
 */
@CommandHandler(ReleaseStockCommand)
export class ReleaseStockHandler implements ICommandHandler<
  ReleaseStockCommand,
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
   * @param command - Release request.
   * @returns Success, or an `InvalidReservationError` for malformed input.
   */
  public async execute(
    command: ReleaseStockCommand,
  ): Promise<Result<void, DomainError>> {
    const reservationResult: Result<StockReservation, DomainError> =
      StockReservation.create(command);
    if (reservationResult.isFailure) {
      return Result.fail(reservationResult.getError());
    }
    const reservation: StockReservation = reservationResult.getValue();
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

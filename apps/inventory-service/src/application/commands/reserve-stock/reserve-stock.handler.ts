import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { InsufficientStockError } from '../../../domain/errors/insufficient-stock.error';
import { ReservationOutcome } from '../../../domain/ports/reservation-outcome.type';
import type { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { STOCK_LEDGER_REPOSITORY_PORT } from '../../../domain/ports/stock-ledger-repository.token';
import type { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { STOCK_RESERVATION_STORE_PORT } from '../../../domain/ports/stock-reservation-store.token';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { ReserveStockCommand } from './reserve-stock.command';

/**
 * Reserves stock atomically on Redis, then records the movement in PostgreSQL (CLAUDE.md §4.1).
 * A replayed reservation key succeeds without reserving or recording twice. If the ledger write
 * fails, the Redis reservation is released so both stores stay consistent.
 */
@CommandHandler(ReserveStockCommand)
export class ReserveStockHandler implements ICommandHandler<
  ReserveStockCommand,
  Result<void, DomainError>
> {
  private readonly logger: Logger = new Logger(ReserveStockHandler.name);

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
   * @param command - Reservation request.
   * @returns Success, an {@link InsufficientStockError}, or an `InvalidReservationError` for malformed input.
   */
  public async execute(
    command: ReserveStockCommand,
  ): Promise<Result<void, DomainError>> {
    const reservationResult: Result<StockReservation, DomainError> =
      StockReservation.create(command);
    if (reservationResult.isFailure) {
      return Result.fail(reservationResult.getError());
    }
    const reservation: StockReservation = reservationResult.getValue();
    const outcome: ReservationOutcome =
      await this.reservationStore.reserve(reservation);
    if (outcome === 'INSUFFICIENT_STOCK') {
      return Result.fail(new InsufficientStockError());
    }
    if (outcome === 'RESERVED') {
      await this.saveReservedMovement(reservation);
    }
    return Result.ok();
  }

  /**
   * Records the reservation in the ledger, undoing it on Redis if the write fails.
   */
  private async saveReservedMovement(
    reservation: StockReservation,
  ): Promise<void> {
    await this.stockLedger
      .recordMovement({ actionType: 'RESERVED', reservation })
      .catch(async (err: unknown): Promise<never> => {
        this.logger.error(
          `Ledger write failed for reservation ${reservation.reservationKey}; releasing it on Redis`,
        );
        await this.reservationStore.release(reservation);
        throw err;
      });
  }
}

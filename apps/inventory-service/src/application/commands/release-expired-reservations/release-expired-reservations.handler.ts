import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ReleaseOutcome } from '../../../domain/ports/release-outcome.type';
import type { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { STOCK_LEDGER_REPOSITORY_PORT } from '../../../domain/ports/stock-ledger-repository.token';
import type { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { STOCK_RESERVATION_STORE_PORT } from '../../../domain/ports/stock-reservation-store.token';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { ReleaseExpiredReservationsCommand } from './release-expired-reservations.command';
import { ReleaseExpiredReservationsOutput } from './release-expired-reservations.output';

/**
 * Returns the stock of reservations that were never committed in time and records an
 * `EXPIRED_RELEASE` movement for each. Safe with several instances: the release script only
 * acts on a `RESERVED` reservation, so each one is released and recorded exactly once.
 */
@CommandHandler(ReleaseExpiredReservationsCommand)
export class ReleaseExpiredReservationsHandler implements ICommandHandler<
  ReleaseExpiredReservationsCommand,
  ReleaseExpiredReservationsOutput
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
   * @param command - Batch size of the run.
   * @returns How many reservations were due and how many were released.
   */
  public async execute(
    command: ReleaseExpiredReservationsCommand,
  ): Promise<ReleaseExpiredReservationsOutput> {
    const expiredReservations: StockReservation[] =
      await this.reservationStore.findExpired(command.batchSize);
    const outcomes: ReleaseOutcome[] = await Promise.all(
      expiredReservations.map(
        (reservation: StockReservation): Promise<ReleaseOutcome> =>
          this.executeExpiredRelease(reservation),
      ),
    );
    return {
      expiredCount: expiredReservations.length,
      releasedCount: outcomes.filter(
        (outcome: ReleaseOutcome): boolean => outcome === 'RELEASED',
      ).length,
    };
  }

  /**
   * Releases one expired reservation and records it when this run released it.
   *
   * @returns The release outcome.
   */
  private async executeExpiredRelease(
    reservation: StockReservation,
  ): Promise<ReleaseOutcome> {
    const outcome: ReleaseOutcome =
      await this.reservationStore.release(reservation);
    if (outcome === 'RELEASED') {
      await this.stockLedger.recordMovement({
        actionType: 'EXPIRED_RELEASE',
        reservation,
      });
    }
    return outcome;
  }
}

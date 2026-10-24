import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AbstractPollingWorker } from '@org/shared-infrastructure';
import { ReleaseExpiredReservationsCommand } from '../../application/commands/release-expired-reservations/release-expired-reservations.command';
import { ReleaseExpiredReservationsOutput } from '../../application/commands/release-expired-reservations/release-expired-reservations.output';

/** Pause between two sweeps when `RESERVATION_SWEEP_INTERVAL_MS` is not set: 30 seconds. */
const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

/** Reservations released per sweep at most; the next sweep picks up the rest. */
const SWEEP_BATCH_SIZE = 100;

/**
 * Background worker releasing expired reservations through {@link ReleaseExpiredReservationsCommand}.
 * Disabled with `RESERVATION_SWEEPER_ENABLED=false` (e.g. an API-only deployment).
 */
@Injectable()
export class ReservationSweeperService extends AbstractPollingWorker {
  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {
    super({
      enabledFlag: 'RESERVATION_SWEEPER_ENABLED',
      intervalVariable: 'RESERVATION_SWEEP_INTERVAL_MS',
      defaultIntervalMs: DEFAULT_SWEEP_INTERVAL_MS,
    });
  }

  /**
   * Runs one sweep and logs what was released.
   */
  protected async executeTick(): Promise<void> {
    const output: ReleaseExpiredReservationsOutput =
      await this.commandBus.execute(
        new ReleaseExpiredReservationsCommand({ batchSize: SWEEP_BATCH_SIZE }),
      );
    this.logReleased(output);
  }

  /**
   * Logs the sweep result when anything was due.
   */
  private logReleased({
    expiredCount,
    releasedCount,
  }: ReleaseExpiredReservationsOutput): void {
    if (expiredCount > 0) {
      this.logger.log(
        `Released ${releasedCount}/${expiredCount} expired reservation(s)`,
      );
    }
  }
}

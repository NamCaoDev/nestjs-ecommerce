import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ReleaseExpiredReservationsCommand } from '../../application/commands/release-expired-reservations/release-expired-reservations.command';
import { ReleaseExpiredReservationsOutput } from '../../application/commands/release-expired-reservations/release-expired-reservations.output';
import { readEnv } from '@org/shared-infrastructure';

/** Default pause between two sweeps: 30 seconds. */
const DEFAULT_SWEEP_INTERVAL_MS = '30000';

/** Reservations released per sweep at most; the next sweep picks up the rest. */
const SWEEP_BATCH_SIZE = 100;

/**
 * Background worker releasing expired reservations every `RESERVATION_SWEEP_INTERVAL_MS`
 * (default 30 s) through {@link ReleaseExpiredReservationsCommand}. Runs never overlap.
 */
@Injectable()
export class ReservationSweeperService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger: Logger = new Logger(ReservationSweeperService.name);
  private timer: NodeJS.Timeout | undefined;
  private isSweeping: boolean = false;

  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {}

  /**
   * Starts the periodic sweep.
   */
  public onApplicationBootstrap(): void {
    const intervalMs: number = Number(
      readEnv({
        name: 'RESERVATION_SWEEP_INTERVAL_MS',
        defaultValue: DEFAULT_SWEEP_INTERVAL_MS,
      }),
    );
    this.timer = setInterval((): void => {
      void this.executeSweep();
    }, intervalMs);
  }

  /**
   * Stops the periodic sweep.
   */
  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /**
   * Runs one sweep unless the previous one is still running. Failures are logged and retried
   * on the next tick.
   */
  public async executeSweep(): Promise<void> {
    if (this.isSweeping) {
      return;
    }
    this.isSweeping = true;
    try {
      const output: ReleaseExpiredReservationsOutput =
        await this.commandBus.execute(
          new ReleaseExpiredReservationsCommand({
            batchSize: SWEEP_BATCH_SIZE,
          }),
        );
      this.logReleased(output);
    } catch (err: unknown) {
      this.logger.error(
        `Reservation sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isSweeping = false;
    }
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

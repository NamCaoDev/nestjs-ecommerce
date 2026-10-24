import { Command } from '@nestjs/cqrs';
import { ReleaseExpiredReservationsOutput } from './release-expired-reservations.output';

/**
 * Command releasing reservations whose lifetime has passed without a commit.
 * Handled by {@link ReleaseExpiredReservationsHandler}.
 */
export class ReleaseExpiredReservationsCommand extends Command<ReleaseExpiredReservationsOutput> {
  /** Maximum number of reservations processed in one run. */
  public readonly batchSize: number;

  /**
   * @param props - Batch size of the run.
   */
  public constructor({ batchSize }: { readonly batchSize: number }) {
    super();
    this.batchSize = batchSize;
  }
}

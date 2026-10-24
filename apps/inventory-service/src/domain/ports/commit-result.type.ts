import { CommitOutcome } from './commit-outcome.type';

/**
 * Result of {@link StockReservationStorePort.commit}.
 */
export interface CommitResult {
  readonly outcome: CommitOutcome;
  /**
   * `true` when the stock was shipped without a live reservation (its reserved units had already
   * been freed), so only the total decreases. Known for every shipped outcome, including redeliveries.
   */
  readonly isReacquired: boolean;
}

/**
 * Requested move between two statuses of a state machine.
 */
export interface StatusTransition<TStatus extends string> {
  readonly from: TStatus;
  readonly to: TStatus;
}

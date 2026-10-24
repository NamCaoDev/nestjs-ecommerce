import { DomainError } from '@org/shared-domain';

/**
 * Raised when the gateway reports a captured amount different from the amount charged.
 */
export class AmountMismatchError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.AMOUNT_MISMATCH';

  /**
   * @param details - Ledger entry, expected and reported amounts.
   */
  public constructor({
    transactionId,
    expected,
    reported,
  }: {
    readonly transactionId: string;
    readonly expected: number;
    readonly reported: number;
  }) {
    super(
      `Transaction ${transactionId} charged ${expected} but the gateway reported ${reported}.`,
    );
  }
}

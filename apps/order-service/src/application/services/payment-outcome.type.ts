/**
 * What processing a payment event did to the order:
 * - `APPLIED`: the order moved and the event was recorded with the change;
 * - `ALREADY_IN_STATE`: the order already had the target status; the event was recorded;
 * - `DUPLICATE_EVENT`: the event was already in the inbox; nothing was done.
 */
export type PaymentOutcome = 'APPLIED' | 'ALREADY_IN_STATE' | 'DUPLICATE_EVENT';

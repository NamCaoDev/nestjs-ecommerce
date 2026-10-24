/**
 * Integration event recorded in the transactional inbox once processed.
 */
export interface InboxEntry {
  /** Event id; the primary key that makes a redelivery recognisable. */
  readonly eventId: string;
  /** e.g. `payment.succeeded`. */
  readonly eventType: string;
  /** Producing service, e.g. `payment-service`. */
  readonly source: string;
  /** Event payload, kept for audits. */
  readonly payload: Readonly<Record<string, unknown>>;
}

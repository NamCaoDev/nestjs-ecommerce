import { DomainError } from '@org/shared-domain';

/**
 * Raised when an integration event is already in the transactional inbox (concurrent redelivery).
 */
export class DuplicateInboxEventError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'INBOX.DUPLICATE_EVENT';

  /**
   * @param eventId - Event already processed.
   */
  public constructor(eventId: string) {
    super(`Event ${eventId} was already processed.`);
  }
}

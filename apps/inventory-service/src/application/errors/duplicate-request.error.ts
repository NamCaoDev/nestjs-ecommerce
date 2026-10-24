import { DomainError } from '@org/shared-domain';

/**
 * Raised when a state-changing request reuses an Idempotency-Key that was already applied.
 */
export class DuplicateRequestError extends DomainError {
  /** Stable error code for transport mapping (HTTP 409). */
  public readonly code: string = 'IDEMPOTENCY.DUPLICATE_REQUEST';

  /**
   * @param idempotencyKey - Key that was already used.
   */
  public constructor(idempotencyKey: string) {
    super(
      `Request with Idempotency-Key ${idempotencyKey} was already applied.`,
    );
  }
}

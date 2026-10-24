import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';

/**
 * Command cancelling a pending order. Handled by {@link CancelOrderHandler}.
 */
export class CancelOrderCommand extends Command<Result<void, DomainError>> {
  /** Logical order identifier (UUID). */
  public readonly orderId: string;
  /** Why the order is cancelled. */
  public readonly reason: string;

  /**
   * @param props - Order identifier and cancellation reason.
   */
  public constructor({
    orderId,
    reason,
  }: {
    readonly orderId: string;
    readonly reason: string;
  }) {
    super();
    this.orderId = orderId;
    this.reason = reason;
  }
}

import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';

/**
 * Command confirming a pending order once it has been paid. Handled by {@link ConfirmOrderHandler}.
 */
export class ConfirmOrderCommand extends Command<Result<void, DomainError>> {
  /** Logical order identifier (UUID). */
  public readonly orderId: string;

  /**
   * @param props - Order identifier.
   */
  public constructor({ orderId }: { readonly orderId: string }) {
    super();
    this.orderId = orderId;
  }
}

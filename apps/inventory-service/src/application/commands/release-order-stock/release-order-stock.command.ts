import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';

/**
 * Command returning the stock held for an unpaid order. Handled by {@link ReleaseOrderStockHandler}.
 */
export class ReleaseOrderStockCommand extends Command<
  Result<void, DomainError>
> {
  /** Logical identifier of the order (UUID). */
  public readonly orderId: string;

  /**
   * @param props - Order identifier.
   */
  public constructor({ orderId }: { readonly orderId: string }) {
    super();
    this.orderId = orderId;
  }
}

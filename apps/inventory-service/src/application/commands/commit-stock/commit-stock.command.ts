import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { ReservationLine } from '../../../domain/value-objects/reservation-line.type';

/**
 * Command shipping the stock of a paid order. Handled by {@link CommitStockHandler}.
 */
export class CommitStockCommand extends Command<Result<void, DomainError>> {
  /** Logical identifier of the paid order (UUID). */
  public readonly orderId: string;
  /** Ordered lines from the `payment.succeeded` event; used when the reservation is gone. */
  public readonly items: readonly ReservationLine[];

  /**
   * @param props - Paid order identifier and its lines.
   */
  public constructor({
    orderId,
    items,
  }: {
    readonly orderId: string;
    readonly items: readonly ReservationLine[];
  }) {
    super();
    this.orderId = orderId;
    this.items = items;
  }
}

import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { ReservationLine } from '../../../domain/value-objects/reservation-line.type';
import { StockCommandProps } from '../stock-command.props';

/**
 * Command releasing the stock held by a reservation (compensation). Handled by {@link ReleaseStockHandler}.
 */
export class ReleaseStockCommand extends Command<Result<void, DomainError>> {
  public readonly reservationKey: string;
  public readonly orderId: string;
  public readonly items: readonly ReservationLine[];

  /**
   * @param props - Reservation key, order and lines.
   */
  public constructor(props: StockCommandProps) {
    super();
    this.reservationKey = props.reservationKey;
    this.orderId = props.orderId;
    this.items = props.items;
  }
}

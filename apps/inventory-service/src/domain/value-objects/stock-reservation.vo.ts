import { Result, ValueObject } from '@org/shared-domain';
import { InvalidReservationError } from '../errors/invalid-reservation.error';
import { isBlank } from '../utils/is-blank.util';
import { isUuid } from '../utils/is-uuid.util';
import { ReservationLine } from './reservation-line.type';
import { StockReservationProps } from './stock-reservation.props';

/** Longest accepted reservation key; matches `stock_ledger.reservation_key VARCHAR(200)`. */
const MAX_RESERVATION_KEY_LENGTH = 200;

/**
 * Validated, all-or-nothing request to reserve or release stock for an order.
 */
export class StockReservation extends ValueObject<StockReservationProps> {
  private constructor(props: StockReservationProps) {
    super(props);
  }

  /**
   * @param props - Reservation key, order and lines.
   * @returns The reservation, or an {@link InvalidReservationError} describing the first violated rule.
   */
  public static create(
    props: StockReservationProps,
  ): Result<StockReservation, InvalidReservationError> {
    const violation: string | undefined = StockReservation.findViolation(props);
    if (violation !== undefined) {
      return Result.fail(new InvalidReservationError(violation));
    }
    return Result.ok(
      new StockReservation({
        reservationKey: props.reservationKey,
        orderId: props.orderId,
        items: props.items.map((item: ReservationLine): ReservationLine => ({
          ...item,
        })),
      }),
    );
  }

  /**
   * @returns The reservation key.
   */
  public get reservationKey(): string {
    return this.props.reservationKey;
  }

  /**
   * @returns The logical order identifier.
   */
  public get orderId(): string {
    return this.props.orderId;
  }

  /**
   * @returns The reserved lines.
   */
  public get items(): readonly ReservationLine[] {
    return this.props.items;
  }

  /**
   * @returns The first violated rule, or `undefined` when the request is valid.
   */
  private static findViolation({
    reservationKey,
    orderId,
    items,
  }: StockReservationProps): string | undefined {
    if (
      isBlank(reservationKey) ||
      reservationKey.length > MAX_RESERVATION_KEY_LENGTH
    ) {
      return `reservationKey must be 1-${MAX_RESERVATION_KEY_LENGTH} characters`;
    }
    if (!isUuid(orderId)) {
      return 'orderId must be a UUID';
    }
    if (items.length === 0) {
      return 'at least one item is required';
    }
    return StockReservation.findLineViolation(items);
  }

  /**
   * @returns The first invalid line rule, or `undefined` when every line is valid.
   */
  private static findLineViolation(
    items: readonly ReservationLine[],
  ): string | undefined {
    if (!items.every((item: ReservationLine): boolean => isUuid(item.skuId))) {
      return 'every skuId must be a UUID';
    }
    if (
      !items.every(
        (item: ReservationLine): boolean =>
          Number.isInteger(item.quantity) && item.quantity > 0,
      )
    ) {
      return 'every quantity must be a positive integer';
    }
    const skuIds: Set<string> = new Set(
      items.map((item: ReservationLine): string => item.skuId),
    );
    return skuIds.size === items.length
      ? undefined
      : 'each skuId may appear only once';
  }
}

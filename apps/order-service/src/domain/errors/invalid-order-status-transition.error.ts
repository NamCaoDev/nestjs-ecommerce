import { DomainError } from '@org/shared-domain';
import { OrderStatusValue } from '../value-objects/order-status-value.type';

/**
 * Raised when an order is asked to move to a status its current status does not allow.
 */
export class InvalidOrderStatusTransitionError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.INVALID_STATUS_TRANSITION';

  /**
   * @param transition - Current and requested statuses.
   */
  public constructor({
    from,
    to,
  }: {
    readonly from: OrderStatusValue;
    readonly to: OrderStatusValue;
  }) {
    super(`Cannot move an order from ${from} to ${to}.`);
  }
}

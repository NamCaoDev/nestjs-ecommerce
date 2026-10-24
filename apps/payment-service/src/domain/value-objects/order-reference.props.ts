import { PaymentLine } from './payment-line.type';

/**
 * State of an {@link OrderReference}.
 */
export interface OrderReferenceProps {
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** Logical customer identifier (UUID). */
  readonly customerId: string;
  /** Ordered lines, captured when the order was placed. */
  readonly lines: readonly PaymentLine[];
}

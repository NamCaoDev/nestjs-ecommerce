import { Order } from '../../domain/aggregates/order.aggregate';
import { InboxEntry } from './inbox-entry.type';

/**
 * Input of {@link InboxPort.saveOrderWithEntry}.
 */
export interface SaveOrderWithInboxEntryInput {
  /** Order changed through domain methods, with its pending events. */
  readonly order: Order;
  /** Event that caused the change. */
  readonly entry: InboxEntry;
}

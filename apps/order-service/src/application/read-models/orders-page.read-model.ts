import { OrderReadModel } from './order.read-model';

/**
 * One page of a customer's orders, newest first.
 */
export interface OrdersPageReadModel {
  readonly items: readonly OrderReadModel[];
  /** 1-based page number. */
  readonly page: number;
  readonly limit: number;
  /** Number of orders of the customer across all pages. */
  readonly total: number;
}

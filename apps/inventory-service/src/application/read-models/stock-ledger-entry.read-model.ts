/**
 * Read model of one stock ledger entry. Timestamps are epoch milliseconds.
 */
export interface StockLedgerEntryReadModel {
  readonly id: string;
  readonly skuId: string;
  readonly actionType: string;
  /** Signed quantity: positive when reserving, negative when releasing, committing or expiring. */
  readonly quantityChanged: number;
  /** Null for `RESTOCK`. */
  readonly orderId: string | null;
  /** Null for `RESTOCK`. */
  readonly reservationKey: string | null;
  /** Reference of a `RESTOCK`, e.g. a purchase order number. */
  readonly referenceNote: string | null;
  readonly createdAt: number;
}

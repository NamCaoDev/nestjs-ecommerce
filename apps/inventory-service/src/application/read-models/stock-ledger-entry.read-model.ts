/**
 * Read model of one stock ledger entry. Timestamps are epoch milliseconds.
 */
export interface StockLedgerEntryReadModel {
  readonly id: string;
  readonly skuId: string;
  readonly actionType: string;
  /** Signed quantity: positive when reserving, negative when releasing, committing or expiring. */
  readonly quantityChanged: number;
  readonly orderId: string;
  readonly reservationKey: string;
  readonly createdAt: number;
}

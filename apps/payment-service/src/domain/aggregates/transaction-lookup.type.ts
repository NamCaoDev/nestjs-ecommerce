/**
 * How a ledger entry is found: by its id (the merchant reference sent to the gateway), by the gateway
 * transaction id, or by the key of the request that created it.
 */
export type TransactionLookup =
  | { readonly transactionId: string }
  | { readonly gatewayTxId: string }
  | { readonly idempotencyKey: string };

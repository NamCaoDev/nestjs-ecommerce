import { RestockRequest } from '../../domain/value-objects/restock-request.vo';

/**
 * Input of {@link StockInboundPort.saveRestock}.
 */
export interface SaveRestockInput {
  readonly restock: RestockRequest;
  /** Idempotency-Key of the request; stored on the ledger entry to apply a retry only once. */
  readonly idempotencyKey: string;
}

import { StockReservation } from '../value-objects/stock-reservation.vo';
import { StockActionType } from './stock-action-type.type';

/**
 * Input of {@link StockLedgerRepositoryPort.recordMovement}.
 */
export interface RecordStockMovementInput {
  readonly actionType: StockActionType;
  readonly reservation: StockReservation;
  /**
   * For `COMMITTED` only: the stock was shipped without a live reservation, so the reserved
   * counter is left unchanged (it was already freed by the expiry). Defaults to `false`.
   */
  readonly isReacquired?: boolean;
}

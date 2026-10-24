import { StockActionType } from './stock-action-type.type';

/**
 * Input of {@link StockLedgerRepositoryPort.hasMovement}.
 */
export interface HasMovementInput {
  readonly orderId: string;
  readonly actionType: StockActionType;
}

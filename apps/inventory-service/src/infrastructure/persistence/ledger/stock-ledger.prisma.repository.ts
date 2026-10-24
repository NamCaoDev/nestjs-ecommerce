import { Injectable } from '@nestjs/common';
import { HasMovementInput } from '../../../domain/ports/has-movement.input';
import { RecordStockMovementInput } from '../../../domain/ports/record-stock-movement.input';
import { StockActionType } from '../../../domain/ports/stock-action-type.type';
import { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { ReservationLine } from '../../../domain/value-objects/reservation-line.type';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/** Effect of one unit of movement on the stock counters, per action. */
interface CounterEffect {
  readonly reserved: number;
  readonly total: number;
}

/** Counter changes per unit: reserving holds stock, releasing (or expiring) frees it, committing ships it. */
const COUNTER_EFFECTS: Readonly<Record<StockActionType, CounterEffect>> = {
  RESERVED: { reserved: 1, total: 0 },
  RELEASED: { reserved: -1, total: 0 },
  COMMITTED: { reserved: -1, total: -1 },
  EXPIRED_RELEASE: { reserved: -1, total: 0 },
};

/** Counter change per unit of a commit made without a live reservation: only the total decreases. */
const REACQUIRED_COMMIT_EFFECT: CounterEffect = { reserved: 0, total: -1 };

/** Sign of the ledger quantity per action: reservations add, releases and commits remove. */
const LEDGER_SIGN: Readonly<Record<StockActionType, number>> = {
  RESERVED: 1,
  RELEASED: -1,
  COMMITTED: -1,
  EXPIRED_RELEASE: -1,
};

/**
 * Prisma implementation of {@link StockLedgerRepositoryPort}. Counters change through atomic
 * increments (no `SELECT FOR UPDATE`, CLAUDE.md §4.1); the table CHECK constraint rejects any
 * update that would break `0 <= reserved <= total`, rolling back the whole movement.
 */
@Injectable()
export class StockLedgerPrismaRepository implements StockLedgerRepositoryPort {
  /**
   * @param prisma - Client for `inventory_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param input - Movement kind and the reservation it applies to.
   */
  public async recordMovement({
    actionType,
    reservation,
    isReacquired = false,
  }: RecordStockMovementInput): Promise<void> {
    const effect: CounterEffect =
      actionType === 'COMMITTED' && isReacquired
        ? REACQUIRED_COMMIT_EFFECT
        : COUNTER_EFFECTS[actionType];
    await this.prisma.client.$transaction([
      ...reservation.items.map(
        (item: ReservationLine): Prisma.PrismaPromise<unknown> =>
          this.prisma.client.inventoryStock.update({
            where: { skuId: item.skuId },
            data: {
              reservedQuantity: { increment: effect.reserved * item.quantity },
              totalQuantity: { increment: effect.total * item.quantity },
              version: { increment: 1 },
            },
          }),
      ),
      this.prisma.client.stockLedger.createMany({
        data: reservation.items.map(
          (item: ReservationLine): Prisma.StockLedgerCreateManyInput => ({
            skuId: item.skuId,
            quantityChanged: LEDGER_SIGN[actionType] * item.quantity,
            actionType,
            orderId: reservation.orderId,
            reservationKey: reservation.reservationKey,
          }),
        ),
      }),
    ]);
  }

  /**
   * @param input - Order and movement kind.
   * @returns `true` when the ledger already holds such a movement for the order.
   */
  public async hasMovement({
    orderId,
    actionType,
  }: HasMovementInput): Promise<boolean> {
    const count: number = await this.prisma.client.stockLedger.count({
      where: { orderId, actionType },
    });
    return count > 0;
  }
}

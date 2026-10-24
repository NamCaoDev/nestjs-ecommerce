import { StockActionType } from '../../../domain/ports/stock-action-type.type';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { PrismaService } from '../prisma/prisma.service';
import { StockLedgerPrismaRepository } from './stock-ledger.prisma.repository';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const INPUT_RESERVATION: StockReservation = StockReservation.create({
  reservationKey: 'c1:checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: [{ skuId: SKU_ID, quantity: 3 }],
}).getValue();

describe('StockLedgerPrismaRepository', () => {
  let mockPrisma: {
    readonly $transaction: jest.Mock;
    readonly inventoryStock: { readonly update: jest.Mock };
    readonly stockLedger: {
      readonly createMany: jest.Mock;
      readonly count: jest.Mock;
    };
  };
  let repository: StockLedgerPrismaRepository;
  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      inventoryStock: { update: jest.fn().mockReturnValue('update-op') },
      stockLedger: {
        createMany: jest.fn().mockReturnValue('ledger-op'),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    repository = new StockLedgerPrismaRepository({
      client: mockPrisma,
    } as unknown as PrismaService);
  });
  describe('recordMovement', () => {
    it.each([
      { actionType: 'RESERVED', reserved: 3, total: 0, ledger: 3 },
      { actionType: 'RELEASED', reserved: -3, total: 0, ledger: -3 },
      { actionType: 'COMMITTED', reserved: -3, total: -3, ledger: -3 },
      { actionType: 'EXPIRED_RELEASE', reserved: -3, total: 0, ledger: -3 },
    ])(
      'should apply a $actionType movement in one transaction',
      async ({ actionType, reserved, total, ledger }) => {
        // Arrange
        const inputActionType: StockActionType = actionType as StockActionType;
        // Act
        await repository.recordMovement({
          actionType: inputActionType,
          reservation: INPUT_RESERVATION,
        });
        // Assert
        expect(mockPrisma.$transaction).toHaveBeenCalledWith([
          'update-op',
          'ledger-op',
        ]);
        expect(mockPrisma.inventoryStock.update).toHaveBeenCalledWith({
          where: { skuId: SKU_ID },
          data: {
            reservedQuantity: { increment: reserved },
            totalQuantity: { increment: total },
            version: { increment: 1 },
          },
        });
        expect(mockPrisma.stockLedger.createMany).toHaveBeenCalledWith({
          data: [
            {
              skuId: SKU_ID,
              quantityChanged: ledger,
              actionType: inputActionType,
              orderId: INPUT_RESERVATION.orderId,
              reservationKey: 'c1:checkout-42',
            },
          ],
        });
      },
    );
    it('should only decrease the total for a commit made without a live reservation', async () => {
      // Arrange
      const inputIsReacquired: boolean = true;
      // Act
      await repository.recordMovement({
        actionType: 'COMMITTED',
        reservation: INPUT_RESERVATION,
        isReacquired: inputIsReacquired,
      });
      // Assert
      expect(mockPrisma.inventoryStock.update).toHaveBeenCalledWith({
        where: { skuId: SKU_ID },
        data: {
          reservedQuantity: { increment: 0 },
          totalQuantity: { increment: -3 },
          version: { increment: 1 },
        },
      });
    });
  });
  describe('hasMovement', () => {
    it.each([
      { inputCount: 0, expectedResult: false },
      { inputCount: 1, expectedResult: true },
    ])(
      'should return $expectedResult when $inputCount entries exist',
      async ({ inputCount, expectedResult }) => {
        // Arrange
        mockPrisma.stockLedger.count.mockResolvedValue(inputCount);
        // Act
        const actualResult: boolean = await repository.hasMovement({
          orderId: INPUT_RESERVATION.orderId,
          actionType: 'COMMITTED',
        });
        // Assert
        expect(actualResult).toBe(expectedResult);
        expect(mockPrisma.stockLedger.count).toHaveBeenCalledWith({
          where: {
            orderId: INPUT_RESERVATION.orderId,
            actionType: 'COMMITTED',
          },
        });
      },
    );
  });
});

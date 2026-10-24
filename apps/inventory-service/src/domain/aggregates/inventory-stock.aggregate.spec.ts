import { Result } from '@org/shared-domain';
import { InvalidStockError } from '../errors/invalid-stock.error';
import { InventoryStock } from './inventory-stock.aggregate';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

describe('InventoryStock', () => {
  describe('create', () => {
    it('should stock the SKU with nothing reserved', () => {
      // Arrange
      const inputTotal: number = 100;
      // Act
      const actualStock: InventoryStock = InventoryStock.create({
        skuId: SKU_ID,
        totalQuantity: inputTotal,
      }).getValue();
      // Assert
      expect(actualStock.skuId).toBe(SKU_ID);
      expect(actualStock.reservedQuantity).toBe(0);
      expect(actualStock.availableQuantity).toBe(inputTotal);
      expect(actualStock.version).toBe(1);
    });
    it.each([
      { inputSkuId: 'sku-test-101', inputTotal: 1 },
      { inputSkuId: SKU_ID, inputTotal: -1 },
      { inputSkuId: SKU_ID, inputTotal: 2.5 },
    ])(
      'should reject sku $inputSkuId with total $inputTotal',
      ({ inputSkuId, inputTotal }) => {
        // Arrange
        const expectedErrorType: typeof InvalidStockError = InvalidStockError;
        // Act
        const actualResult: Result<InventoryStock, InvalidStockError> =
          InventoryStock.create({
            skuId: inputSkuId,
            totalQuantity: inputTotal,
          });
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
      },
    );
  });
});

import { DomainError } from './domain-error.base';
import { Result } from './result.base';

const INSUFFICIENT_STOCK_CODE = 'INVENTORY.INSUFFICIENT_STOCK';

class InsufficientStockError extends DomainError {
  public readonly code: string = INSUFFICIENT_STOCK_CODE;

  public constructor(sku: string, options?: ErrorOptions) {
    super(`Insufficient stock for SKU ${sku}`, options);
  }
}

describe('DomainError', () => {
  it('should expose the message, the stable code and the concrete class name', () => {
    // Arrange
    const inputSku: string = 'SKU-1';
    // Act
    const actualError: InsufficientStockError = new InsufficientStockError(
      inputSku,
    );
    // Assert
    expect(actualError.message).toBe('Insufficient stock for SKU SKU-1');
    expect(actualError.code).toBe(INSUFFICIENT_STOCK_CODE);
    expect(actualError.name).toBe('InsufficientStockError');
  });
  it('should be an instance of both DomainError and Error', () => {
    // Arrange
    const inputSku: string = 'SKU-1';
    // Act
    const actualError: InsufficientStockError = new InsufficientStockError(
      inputSku,
    );
    // Assert
    expect(actualError).toBeInstanceOf(InsufficientStockError);
    expect(actualError).toBeInstanceOf(DomainError);
    expect(actualError).toBeInstanceOf(Error);
  });
  it('should keep the underlying cause', () => {
    // Arrange
    const expectedCause: Error = new Error('Redis script returned -1');
    // Act
    const actualError: InsufficientStockError = new InsufficientStockError(
      'SKU-1',
      { cause: expectedCause },
    );
    // Assert
    expect(actualError.cause).toBe(expectedCause);
  });
  it('should be usable as the failure reason of a Result', () => {
    // Arrange
    const expectedError: InsufficientStockError = new InsufficientStockError(
      'SKU-1',
    );
    // Act
    const actualResult: Result<number, DomainError> =
      Result.fail(expectedError);
    // Assert
    expect(actualResult.getError()).toBe(expectedError);
  });
});

import { buildOrderCode } from './build-order-code.util';

describe('buildOrderCode', () => {
  it('should prefix the last 12 hex digits of the order UUID in upper case', () => {
    // Arrange
    const inputOrderId: string = '0199a7c0-0000-4000-8000-00ab12cd34ef';
    const expectedCode: string = 'ORD-00AB12CD34EF';
    // Act
    const actualCode: string = buildOrderCode(inputOrderId);
    // Assert
    expect(actualCode).toBe(expectedCode);
  });
  it('should be deterministic for the same order', () => {
    // Arrange
    const inputOrderId: string = '0199a7c0-0000-4000-8000-00ab12cd34ef';
    // Act
    const actualCodes: string[] = [
      buildOrderCode(inputOrderId),
      buildOrderCode(inputOrderId),
    ];
    // Assert
    expect(actualCodes[0]).toBe(actualCodes[1]);
  });
});

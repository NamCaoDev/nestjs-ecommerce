import { UnsupportedGatewayError } from '../../../domain/errors/unsupported-gateway.error';
import { GatewayProviderPipe } from './gateway-provider.pipe';

describe('GatewayProviderPipe', () => {
  const pipe: GatewayProviderPipe = new GatewayProviderPipe();
  it.each([
    { inputSegment: 'mock', expectedProvider: 'MOCK' },
    { inputSegment: 'vnpay', expectedProvider: 'VNPAY' },
    { inputSegment: 'vietqr-va', expectedProvider: 'VIETQR_VA' },
  ])(
    'should resolve $inputSegment to $expectedProvider',
    ({ inputSegment, expectedProvider }) => {
      // Arrange
      // Act
      const actualProvider: string = pipe.transform(inputSegment);
      // Assert
      expect(actualProvider).toBe(expectedProvider);
    },
  );
  it('should refuse an unknown gateway', () => {
    // Arrange
    // Act
    const actualTransform: () => string = () => pipe.transform('paypal');
    // Assert
    expect(actualTransform).toThrow(UnsupportedGatewayError);
  });
});

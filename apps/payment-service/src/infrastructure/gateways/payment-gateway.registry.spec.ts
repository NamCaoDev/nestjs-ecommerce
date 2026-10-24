import { DefaultGatewaySelection } from '../../application/ports/default-gateway-selection.type';
import { UnsupportedGatewayError } from '../../domain/errors/unsupported-gateway.error';
import { MockGatewayAdapter } from './mock/mock-gateway.adapter';
import { PaymentGatewayRegistry } from './payment-gateway.registry';
import { VietqrVaGatewayAdapter } from './vietqr-va/vietqr-va-gateway.adapter';
import { VnpayGatewayAdapter } from './vnpay/vnpay-gateway.adapter';

/**
 * Builds a registry with every adapter.
 */
const createRegistry = (): PaymentGatewayRegistry =>
  new PaymentGatewayRegistry(
    new MockGatewayAdapter(),
    new VnpayGatewayAdapter(),
    new VietqrVaGatewayAdapter(),
  );

describe('PaymentGatewayRegistry', () => {
  afterEach(() => {
    delete process.env['PAYMENT_DEFAULT_GATEWAY'];
    delete process.env['PAYMENT_DEFAULT_CHANNEL'];
  });
  it.each(['MOCK', 'VNPAY', 'VIETQR_VA'] as const)(
    'should return the %s adapter',
    (inputProvider: 'MOCK' | 'VNPAY' | 'VIETQR_VA') => {
      // Arrange
      const registry: PaymentGatewayRegistry = createRegistry();
      // Act
      const actualName: string = registry.get(inputProvider).gatewayName;
      // Assert
      expect(actualName).toBe(inputProvider);
    },
  );
  it('should refuse a provider without adapter', () => {
    // Arrange
    const registry: PaymentGatewayRegistry = createRegistry();
    // Act
    const actualGet: () => unknown = () => registry.get('MOMO');
    // Assert
    expect(actualGet).toThrow(UnsupportedGatewayError);
  });
  it('should default to MOCK with QR_CODE', () => {
    // Arrange
    const registry: PaymentGatewayRegistry = createRegistry();
    // Act
    const actualDefault: DefaultGatewaySelection = registry.getDefault();
    // Assert
    expect(actualDefault.gateway.gatewayName).toBe('MOCK');
    expect(actualDefault.channel).toBe('QR_CODE');
  });
  it('should follow PAYMENT_DEFAULT_GATEWAY and PAYMENT_DEFAULT_CHANNEL', () => {
    // Arrange
    process.env['PAYMENT_DEFAULT_GATEWAY'] = 'VNPAY';
    process.env['PAYMENT_DEFAULT_CHANNEL'] = 'DOMESTIC_BANK';
    const registry: PaymentGatewayRegistry = createRegistry();
    // Act
    const actualDefault: DefaultGatewaySelection = registry.getDefault();
    // Assert
    expect(actualDefault.gateway.gatewayName).toBe('VNPAY');
    expect(actualDefault.channel).toBe('DOMESTIC_BANK');
  });
  it('should refuse an unknown default channel', () => {
    // Arrange
    process.env['PAYMENT_DEFAULT_CHANNEL'] = 'CASH';
    const registry: PaymentGatewayRegistry = createRegistry();
    // Act
    const actualGetDefault: () => unknown = () => registry.getDefault();
    // Assert
    expect(actualGetDefault).toThrow(UnsupportedGatewayError);
  });
});

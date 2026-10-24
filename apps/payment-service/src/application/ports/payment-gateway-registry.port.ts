import { PaymentGatewayPort } from '../../domain/ports/payment-gateway.port';
import { PaymentGatewayProvider } from '../../domain/types/payment-gateway-provider.type';
import { DefaultGatewaySelection } from './default-gateway-selection.type';

/**
 * Looks up gateway adapters by provider. Injected with {@link PAYMENT_GATEWAY_REGISTRY_PORT}.
 */
export interface PaymentGatewayRegistryPort {
  /**
   * @param provider - Gateway provider.
   * @returns Its adapter.
   * @throws {UnsupportedGatewayError} When no adapter serves the provider.
   */
  get(provider: PaymentGatewayProvider): PaymentGatewayPort;

  /**
   * @returns The gateway and channel configured for new payments.
   */
  getDefault(): DefaultGatewaySelection;
}

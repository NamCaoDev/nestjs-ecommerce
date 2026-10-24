import { Injectable, PipeTransform } from '@nestjs/common';
import { UnsupportedGatewayError } from '../../../domain/errors/unsupported-gateway.error';
import { PAYMENT_GATEWAY_PROVIDERS } from '../../../domain/types/payment-gateway-providers';
import { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';

/**
 * Resolves the `:gateway` route segment (`mock`, `vnpay`, `vietqr-va`, ...) to a gateway provider.
 */
@Injectable()
export class GatewayProviderPipe implements PipeTransform<
  string,
  PaymentGatewayProvider
> {
  /**
   * @param value - Route segment.
   * @returns The provider.
   * @throws {UnsupportedGatewayError} For an unknown gateway (HTTP 404).
   */
  public transform(value: string): PaymentGatewayProvider {
    const candidate: string = value.toUpperCase().replace(/-/g, '_');
    const provider: PaymentGatewayProvider | undefined =
      PAYMENT_GATEWAY_PROVIDERS.find(
        (known: PaymentGatewayProvider): boolean => known === candidate,
      );
    if (provider === undefined) {
      throw new UnsupportedGatewayError(value);
    }
    return provider;
  }
}

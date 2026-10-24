import { Injectable } from '@nestjs/common';
import { readEnv } from '@org/shared-infrastructure';
import { DefaultGatewaySelection } from '../../application/ports/default-gateway-selection.type';
import { PaymentGatewayRegistryPort } from '../../application/ports/payment-gateway-registry.port';
import { UnsupportedGatewayError } from '../../domain/errors/unsupported-gateway.error';
import { PaymentGatewayPort } from '../../domain/ports/payment-gateway.port';
import { PaymentChannel } from '../../domain/types/payment-channel.type';
import { PaymentGatewayProvider } from '../../domain/types/payment-gateway-provider.type';
import { MockGatewayAdapter } from './mock/mock-gateway.adapter';
import { VietqrVaGatewayAdapter } from './vietqr-va/vietqr-va-gateway.adapter';
import { VnpayGatewayAdapter } from './vnpay/vnpay-gateway.adapter';

/** Gateway used for new payments when `PAYMENT_DEFAULT_GATEWAY` is not set. */
const DEFAULT_GATEWAY: PaymentGatewayProvider = 'MOCK';

/** Channel used for new payments when `PAYMENT_DEFAULT_CHANNEL` is not set. */
const DEFAULT_CHANNEL: PaymentChannel = 'QR_CODE';

/** Channels accepted in `PAYMENT_DEFAULT_CHANNEL`. */
const CHANNELS: readonly PaymentChannel[] = [
  'QR_CODE',
  'DOMESTIC_BANK',
  'INTERNATIONAL_CARD',
  'BANK_TRANSFER',
] as const;

/**
 * Registry of the available gateway adapters (strategy pattern), keyed by provider. New payments use
 * `PAYMENT_DEFAULT_GATEWAY` (default MOCK) with `PAYMENT_DEFAULT_CHANNEL` (default QR_CODE).
 */
@Injectable()
export class PaymentGatewayRegistry implements PaymentGatewayRegistryPort {
  private readonly adapters: ReadonlyMap<
    PaymentGatewayProvider,
    PaymentGatewayPort
  >;
  private readonly defaultProvider: string = readEnv({
    name: 'PAYMENT_DEFAULT_GATEWAY',
    defaultValue: DEFAULT_GATEWAY,
  });
  private readonly defaultChannel: string = readEnv({
    name: 'PAYMENT_DEFAULT_CHANNEL',
    defaultValue: DEFAULT_CHANNEL,
  });

  /**
   * @param mockAdapter - MOCK gateway.
   * @param vnpayAdapter - VNPay gateway.
   * @param vietqrVaAdapter - VietQR virtual-account gateway.
   */
  public constructor(
    mockAdapter: MockGatewayAdapter,
    vnpayAdapter: VnpayGatewayAdapter,
    vietqrVaAdapter: VietqrVaGatewayAdapter,
  ) {
    this.adapters = new Map(
      [mockAdapter, vnpayAdapter, vietqrVaAdapter].map(
        (
          adapter: PaymentGatewayPort,
        ): [PaymentGatewayProvider, PaymentGatewayPort] => [
          adapter.gatewayName,
          adapter,
        ],
      ),
    );
  }

  /**
   * @param provider - Gateway provider.
   * @returns Its adapter.
   * @throws {UnsupportedGatewayError} When no adapter serves the provider.
   */
  public get(provider: PaymentGatewayProvider): PaymentGatewayPort {
    const adapter: PaymentGatewayPort | undefined = this.adapters.get(provider);
    if (adapter === undefined) {
      throw new UnsupportedGatewayError(provider);
    }
    return adapter;
  }

  /**
   * @returns The configured default gateway and channel.
   * @throws {UnsupportedGatewayError} When the configured gateway or channel is unknown.
   */
  public getDefault(): DefaultGatewaySelection {
    const channel: PaymentChannel | undefined = CHANNELS.find(
      (candidate: PaymentChannel): boolean => candidate === this.defaultChannel,
    );
    if (channel === undefined) {
      throw new UnsupportedGatewayError(`channel ${this.defaultChannel}`);
    }
    return {
      gateway: this.get(this.defaultProvider as PaymentGatewayProvider),
      channel,
    };
  }
}

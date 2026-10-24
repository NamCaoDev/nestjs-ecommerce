import { BuildSignedWebhookInput } from './build-signed-webhook.input';
import { SignedWebhook } from './signed-webhook.type';

/**
 * Plays the mock gateway for development and tests: produces the webhook it would send.
 * Injected with {@link MOCK_GATEWAY_SIMULATOR_PORT}.
 */
export interface MockGatewaySimulatorPort {
  /**
   * @param input - Charge, amount and result.
   * @returns The signed webhook request.
   */
  buildSignedWebhook(input: BuildSignedWebhookInput): SignedWebhook;
}

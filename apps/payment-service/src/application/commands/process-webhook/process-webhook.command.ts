import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';
import { ProcessWebhookCommandProps } from './process-webhook-command.props';

/**
 * Command applying a gateway notification to the ledger. Handled by {@link ProcessWebhookHandler}.
 */
export class ProcessWebhookCommand extends Command<Result<void, DomainError>> {
  public readonly gateway: PaymentGatewayProvider;
  public readonly headers: Record<string, string>;
  public readonly rawBody: string;
  public readonly ipAddress: string | undefined;

  /**
   * @param props - Gateway, headers, raw body and caller IP.
   */
  public constructor(props: ProcessWebhookCommandProps) {
    super();
    this.gateway = props.gateway;
    this.headers = props.headers;
    this.rawBody = props.rawBody;
    this.ipAddress = props.ipAddress;
  }
}

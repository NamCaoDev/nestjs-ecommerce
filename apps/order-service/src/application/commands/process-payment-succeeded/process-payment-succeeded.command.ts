import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { PaymentOutcome } from '../../services/payment-outcome.type';
import { ProcessPaymentSucceededCommandProps } from './process-payment-succeeded-command.props';

/**
 * Command confirming the order of a successful payment, exactly once per event.
 * Handled by {@link ProcessPaymentSucceededHandler}.
 */
export class ProcessPaymentSucceededCommand extends Command<
  Result<PaymentOutcome, DomainError>
> {
  public readonly eventId: string;
  public readonly correlationId: string;
  public readonly orderId: string;
  public readonly payload: Readonly<Record<string, unknown>>;

  /**
   * @param props - Event id, correlation id, order and payload.
   */
  public constructor(props: ProcessPaymentSucceededCommandProps) {
    super();
    this.eventId = props.eventId;
    this.correlationId = props.correlationId;
    this.orderId = props.orderId;
    this.payload = props.payload;
  }
}

import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { PaymentOutcome } from '../../services/payment-outcome.type';
import { ProcessPaymentFailedCommandProps } from './process-payment-failed-command.props';

/**
 * Command cancelling the order of a failed payment, exactly once per event.
 * Handled by {@link ProcessPaymentFailedHandler}.
 */
export class ProcessPaymentFailedCommand extends Command<
  Result<PaymentOutcome, DomainError>
> {
  public readonly eventId: string;
  public readonly correlationId: string;
  public readonly orderId: string;
  public readonly reason: string;
  public readonly payload: Readonly<Record<string, unknown>>;

  /**
   * @param props - Event id, correlation id, order, reason and payload.
   */
  public constructor(props: ProcessPaymentFailedCommandProps) {
    super();
    this.eventId = props.eventId;
    this.correlationId = props.correlationId;
    this.orderId = props.orderId;
    this.reason = props.reason;
    this.payload = props.payload;
  }
}

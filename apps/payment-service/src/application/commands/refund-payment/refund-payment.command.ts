import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { RefundPaymentCommandProps } from './refund-payment-command.props';
import { RefundPaymentOutput } from './refund-payment.output';

/**
 * Command refunding (part of) a paid payment. Handled by {@link RefundPaymentHandler}.
 */
export class RefundPaymentCommand extends Command<
  Result<RefundPaymentOutput, DomainError>
> {
  public readonly paymentId: string;
  public readonly amount: number;
  public readonly reason: string;
  public readonly idempotencyKey: string;
  public readonly actorId: string | undefined;
  public readonly ipAddress: string | undefined;

  /**
   * @param props - Payment, amount, reason, key and operator.
   */
  public constructor(props: RefundPaymentCommandProps) {
    super();
    this.paymentId = props.paymentId;
    this.amount = props.amount;
    this.reason = props.reason;
    this.idempotencyKey = props.idempotencyKey;
    this.actorId = props.actorId;
    this.ipAddress = props.ipAddress;
  }
}

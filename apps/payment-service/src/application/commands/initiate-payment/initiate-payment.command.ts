import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { PaymentLine } from '../../../domain/value-objects/payment-line.type';
import { InitiatePaymentCommandProps } from './initiate-payment-command.props';
import { InitiatePaymentOutput } from './initiate-payment.output';

/**
 * Command opening the payment of a placed order. Handled by {@link InitiatePaymentHandler}.
 */
export class InitiatePaymentCommand extends Command<
  Result<InitiatePaymentOutput, DomainError>
> {
  public readonly orderId: string;
  public readonly customerId: string;
  public readonly amount: number;
  public readonly currency: string;
  public readonly items: readonly PaymentLine[];
  public readonly idempotencyKey: string;

  /**
   * @param props - Order, amount, lines and idempotency key.
   */
  public constructor(props: InitiatePaymentCommandProps) {
    super();
    this.orderId = props.orderId;
    this.customerId = props.customerId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.items = props.items;
    this.idempotencyKey = props.idempotencyKey;
  }
}

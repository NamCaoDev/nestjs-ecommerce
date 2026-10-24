import { Command } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';
import { SimulateGatewayPaymentCommandProps } from './simulate-gateway-payment-command.props';
import { SimulateGatewayPaymentOutput } from './simulate-gateway-payment.output';

/**
 * Development command playing the mock gateway: it signs a webhook and delivers it.
 * Handled by {@link SimulateGatewayPaymentHandler}.
 */
export class SimulateGatewayPaymentCommand extends Command<
  Result<SimulateGatewayPaymentOutput, DomainError>
> {
  public readonly orderId: string;
  public readonly status: FinalTransactionStatus;
  public readonly failureReason: string | undefined;
  public readonly ipAddress: string | undefined;

  /**
   * @param props - Order, reported status, failure reason and caller IP.
   */
  public constructor(props: SimulateGatewayPaymentCommandProps) {
    super();
    this.orderId = props.orderId;
    this.status = props.status;
    this.failureReason = props.failureReason;
    this.ipAddress = props.ipAddress;
  }
}

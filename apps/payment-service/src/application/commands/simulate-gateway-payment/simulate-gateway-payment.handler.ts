import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentTransaction } from '../../../domain/entities/payment-transaction.entity';
import { GatewayOperationNotSupportedError } from '../../../domain/errors/gateway-operation-not-supported.error';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import type { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { PAYMENT_REPOSITORY_PORT } from '../../../domain/ports/payment-repository.token';
import type { MockGatewaySimulatorPort } from '../../ports/mock-gateway-simulator.port';
import { MOCK_GATEWAY_SIMULATOR_PORT } from '../../ports/mock-gateway-simulator.token';
import { SignedWebhook } from '../../ports/signed-webhook.type';
import { ProcessWebhookCommand } from '../process-webhook/process-webhook.command';
import { SimulateGatewayPaymentCommand } from './simulate-gateway-payment.command';
import { SimulateGatewayPaymentOutput } from './simulate-gateway-payment.output';

/**
 * Plays the MOCK gateway for development and end-to-end tests: finds the latest charge of the order,
 * builds the webhook the gateway would send, signs it (HMAC-SHA256) and delivers it to
 * {@link ProcessWebhookCommand}, so verification, idempotency, audit and outbox run as for a real one.
 */
@CommandHandler(SimulateGatewayPaymentCommand)
export class SimulateGatewayPaymentHandler implements ICommandHandler<
  SimulateGatewayPaymentCommand,
  Result<SimulateGatewayPaymentOutput, DomainError>
> {
  /**
   * @param commandBus - Delivers the signed webhook.
   * @param paymentRepository - Finds the charge to complete.
   * @param simulator - Builds signed MOCK webhooks.
   */
  public constructor(
    private readonly commandBus: CommandBus,
    @Inject(PAYMENT_REPOSITORY_PORT)
    private readonly paymentRepository: PaymentRepositoryPort,
    @Inject(MOCK_GATEWAY_SIMULATOR_PORT)
    private readonly simulator: MockGatewaySimulatorPort,
  ) {}

  /**
   * @param command - Order and the result to report.
   * @returns The delivered webhook, or why it could not be delivered or was rejected.
   */
  public async execute(
    command: SimulateGatewayPaymentCommand,
  ): Promise<Result<SimulateGatewayPaymentOutput, DomainError>> {
    const chargeResult: Result<PaymentTransaction, DomainError> =
      await this.findMockCharge(command.orderId);
    if (chargeResult.isFailure) {
      return Result.fail(chargeResult.getError());
    }
    const charge: PaymentTransaction = chargeResult.getValue();
    const webhook: SignedWebhook = this.simulator.buildSignedWebhook({
      transactionId: charge.id,
      orderId: command.orderId,
      amount: charge.amount.amount,
      status: command.status,
      failureReason: command.failureReason,
    });
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new ProcessWebhookCommand({
        gateway: 'MOCK',
        headers: webhook.headers,
        rawBody: webhook.rawBody,
        ipAddress: command.ipAddress,
      }),
    );
    return result.isFailure
      ? Result.fail(result.getError())
      : Result.ok({
          orderId: command.orderId,
          transactionId: charge.id,
          gatewayTxId: webhook.gatewayTxId,
          status: command.status,
        });
  }

  /**
   * @returns The latest MOCK charge of the order, or why there is none.
   */
  private async findMockCharge(
    orderId: string,
  ): Promise<Result<PaymentTransaction, DomainError>> {
    const payment: Payment | undefined =
      await this.paymentRepository.findByOrderId(orderId);
    if (payment === undefined) {
      return Result.fail(new PaymentNotFoundError(orderId));
    }
    const charge: PaymentTransaction | undefined = [...payment.transactions]
      .reverse()
      .find(
        (transaction: PaymentTransaction): boolean =>
          transaction.type === 'CHARGE',
      );
    if (charge === undefined) {
      return Result.fail(new TransactionNotFoundError(orderId));
    }
    return charge.gateway === 'MOCK'
      ? Result.ok(charge)
      : Result.fail(
          new GatewayOperationNotSupportedError({
            gateway: charge.gateway,
            operation: 'mock simulation',
          }),
        );
  }
}

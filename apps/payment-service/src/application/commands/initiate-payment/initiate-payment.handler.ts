import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { randomUUID } from 'node:crypto';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentTransaction } from '../../../domain/entities/payment-transaction.entity';
import { DuplicatePaymentError } from '../../../domain/errors/duplicate-payment.error';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import type { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { PAYMENT_REPOSITORY_PORT } from '../../../domain/ports/payment-repository.token';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderReference } from '../../../domain/value-objects/order-reference.vo';
import { PaymentId } from '../../../domain/value-objects/payment-id.vo';
import { PaymentDomainEventAuditor } from '../../audit/payment-domain-event-auditor';
import { DefaultGatewaySelection } from '../../ports/default-gateway-selection.type';
import type { PaymentGatewayRegistryPort } from '../../ports/payment-gateway-registry.port';
import { PAYMENT_GATEWAY_REGISTRY_PORT } from '../../ports/payment-gateway-registry.token';
import { toGatewayPayload } from '../../utils/to-gateway-payload.util';
import { InitiatePaymentCommand } from './initiate-payment.command';
import { InitiatePaymentOutput } from './initiate-payment.output';

/** Prefix of the ledger key of the charge opened for an `order.placed` event. */
const CHARGE_KEY_PREFIX = 'charge:';

/** Consumer recorded as the actor of the initiation. */
const INITIATOR_ID = 'orders.events';

/**
 * Opens the payment of a placed order: creates the Payment aggregate, asks the default gateway for the
 * customer action (redirect, QR code or virtual account) and opens the first CHARGE as PENDING, then
 * stores the payment, its ledger entry and the audit rows in one ACID transaction. Idempotent: an order
 * that already has a payment gets it back, also when two consumers race (unique order and ledger keys).
 */
@CommandHandler(InitiatePaymentCommand)
export class InitiatePaymentHandler implements ICommandHandler<
  InitiatePaymentCommand,
  Result<InitiatePaymentOutput, DomainError>
> {
  /**
   * @param paymentRepository - Payment persistence.
   * @param gatewayRegistry - Gateway adapters.
   * @param auditor - Turns domain events into activity rows.
   */
  public constructor(
    @Inject(PAYMENT_REPOSITORY_PORT)
    private readonly paymentRepository: PaymentRepositoryPort,
    @Inject(PAYMENT_GATEWAY_REGISTRY_PORT)
    private readonly gatewayRegistry: PaymentGatewayRegistryPort,
    private readonly auditor: PaymentDomainEventAuditor,
  ) {}

  /**
   * @param command - Placed order data.
   * @returns The payment of the order, or a {@link DomainError} when the order data is invalid.
   */
  public async execute(
    command: InitiatePaymentCommand,
  ): Promise<Result<InitiatePaymentOutput, DomainError>> {
    const paymentResult: Result<Payment, DomainError> =
      InitiatePaymentHandler.buildPayment(command);
    if (paymentResult.isFailure) {
      return Result.fail(paymentResult.getError());
    }
    const payment: Payment = paymentResult.getValue();
    const existingPayment: Payment | undefined =
      await this.paymentRepository.findByOrderId(
        payment.orderReference.orderId,
      );
    if (existingPayment !== undefined) {
      return Result.ok(InitiatePaymentHandler.toOutput(existingPayment));
    }
    const actionResult: Result<PaymentClientAction, DomainError> =
      await this.executeOpenCharge({ payment, command });
    if (actionResult.isFailure) {
      return Result.fail(actionResult.getError());
    }
    return this.saveOrReuse({ payment, clientAction: actionResult.getValue() });
  }

  /**
   * @returns The new PENDING payment, or why the order cannot be charged.
   */
  private static buildPayment(
    command: InitiatePaymentCommand,
  ): Result<Payment, DomainError> {
    const referenceResult: Result<OrderReference, DomainError> =
      OrderReference.create({
        orderId: command.orderId,
        customerId: command.customerId,
        lines: command.items,
      });
    if (referenceResult.isFailure) {
      return Result.fail(referenceResult.getError());
    }
    const totalResult: Result<Money, DomainError> = Money.create({
      amount: command.amount,
      currency: command.currency,
    });
    if (totalResult.isFailure) {
      return Result.fail(totalResult.getError());
    }
    return Payment.create({
      id: PaymentId.create(randomUUID()).getValue(),
      orderReference: referenceResult.getValue(),
      totalAmount: totalResult.getValue(),
    });
  }

  /**
   * Asks the default gateway for the customer action and opens the PENDING charge.
   */
  private async executeOpenCharge({
    payment,
    command,
  }: {
    readonly payment: Payment;
    readonly command: InitiatePaymentCommand;
  }): Promise<Result<PaymentClientAction, DomainError>> {
    const { gateway, channel }: DefaultGatewaySelection =
      this.gatewayRegistry.getDefault();
    const transactionId: string = randomUUID();
    const clientAction: PaymentClientAction = await gateway.initiate({
      paymentId: payment.id.value,
      transactionId,
      orderId: payment.orderReference.orderId,
      amount: payment.totalAmount.amount,
      currency: payment.totalAmount.currency,
      channel,
      description: `Order ${payment.orderReference.orderId}`,
    });
    const chargeResult: Result<PaymentTransaction, DomainError> =
      payment.initiateCharge({
        transactionId,
        gateway: gateway.gatewayName,
        channel,
        idempotencyKey: `${CHARGE_KEY_PREFIX}${command.idempotencyKey}`,
        rawGatewayResponse: { clientAction: toGatewayPayload(clientAction) },
      });
    return chargeResult.isFailure
      ? Result.fail(chargeResult.getError())
      : Result.ok(clientAction);
  }

  /**
   * Stores the payment with its audit rows; when a concurrent run stored one first, returns that one.
   */
  private async saveOrReuse({
    payment,
    clientAction,
  }: {
    readonly payment: Payment;
    readonly clientAction: PaymentClientAction;
  }): Promise<Result<InitiatePaymentOutput, DomainError>> {
    const saveResult: Result<void, DuplicatePaymentError> =
      await this.paymentRepository.saveNew({
        payment,
        auditEntries: this.auditor.buildAuditEntries({
          events: payment.domainEvents,
          actor: { actorType: 'SYSTEM', actorId: INITIATOR_ID },
        }),
      });
    if (saveResult.isSuccess) {
      return Result.ok({
        ...InitiatePaymentHandler.toOutput(payment),
        clientAction,
      });
    }
    const storedPayment: Payment | undefined =
      await this.paymentRepository.findByOrderId(
        payment.orderReference.orderId,
      );
    return storedPayment === undefined
      ? Result.fail(saveResult.getError())
      : Result.ok(InitiatePaymentHandler.toOutput(storedPayment));
  }

  /**
   * @returns The output describing a payment and its latest charge.
   */
  private static toOutput(payment: Payment): InitiatePaymentOutput {
    const charge: PaymentTransaction | undefined = payment.transactions.find(
      (transaction: PaymentTransaction): boolean =>
        transaction.type === 'CHARGE',
    );
    return { paymentId: payment.id.value, transactionId: charge?.id ?? '' };
  }
}

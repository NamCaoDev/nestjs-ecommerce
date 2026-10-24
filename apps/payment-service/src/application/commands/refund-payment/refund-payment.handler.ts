import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { randomUUID } from 'node:crypto';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentTransaction } from '../../../domain/entities/payment-transaction.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import type { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { PAYMENT_REPOSITORY_PORT } from '../../../domain/ports/payment-repository.token';
import { RefundGatewayResult } from '../../../domain/ports/refund-gateway-result.type';
import { Money } from '../../../domain/value-objects/money.vo';
import { AUDIT_ACTIONS } from '../../audit/audit-actions';
import { PaymentAuditService } from '../../audit/payment-audit.service';
import { PaymentDomainEventAuditor } from '../../audit/payment-domain-event-auditor';
import { GatewayRefundFailedError } from '../../errors/gateway-refund-failed.error';
import type { PaymentGatewayRegistryPort } from '../../ports/payment-gateway-registry.port';
import { PAYMENT_GATEWAY_REGISTRY_PORT } from '../../ports/payment-gateway-registry.token';
import { RefundPaymentCommand } from './refund-payment.command';
import { RefundPaymentOutput } from './refund-payment.output';

/** Prefix of the ledger key of a refund request, scoped by payment: `refund:{paymentId}:{Idempotency-Key}`. */
const REFUND_KEY_PREFIX = 'refund:';

/**
 * Refunds (part of) a paid payment through the gateway of its successful charge:
 * the aggregate checks the invariants first (PAID or PARTIALLY_REFUNDED, never above the total), the
 * gateway refunds, then a SUCCESS REFUND entry, the new `refundedAmount` and status and the audit rows are
 * saved in one transaction. `totalAmount` never changes. Idempotent per payment and `Idempotency-Key`:
 * a replay returns the recorded refund (a concurrent duplicate gets a conflict); the key is also
 * forwarded to the gateway.
 */
@CommandHandler(RefundPaymentCommand)
export class RefundPaymentHandler implements ICommandHandler<
  RefundPaymentCommand,
  Result<RefundPaymentOutput, DomainError>
> {
  /**
   * @param paymentRepository - Payment persistence.
   * @param gatewayRegistry - Gateway adapters.
   * @param auditor - Turns domain events into activity rows.
   * @param auditService - Records gateway refusals.
   */
  public constructor(
    @Inject(PAYMENT_REPOSITORY_PORT)
    private readonly paymentRepository: PaymentRepositoryPort,
    @Inject(PAYMENT_GATEWAY_REGISTRY_PORT)
    private readonly gatewayRegistry: PaymentGatewayRegistryPort,
    private readonly auditor: PaymentDomainEventAuditor,
    private readonly auditService: PaymentAuditService,
  ) {}

  /**
   * @param command - Payment, amount, reason and key.
   * @returns The payment after the refund, or why it was refused.
   */
  public async execute(
    command: RefundPaymentCommand,
  ): Promise<Result<RefundPaymentOutput, DomainError>> {
    const payment: Payment | undefined = await this.paymentRepository.findById(
      command.paymentId,
    );
    if (payment === undefined) {
      return Result.fail(new PaymentNotFoundError(command.paymentId));
    }
    const idempotencyKey: string = `${REFUND_KEY_PREFIX}${payment.id.value}:${command.idempotencyKey}`;
    const recordedRefund: PaymentTransaction | undefined =
      payment.findTransaction({ idempotencyKey });
    if (recordedRefund !== undefined) {
      return Result.ok(
        RefundPaymentHandler.toOutput({ payment, refund: recordedRefund }),
      );
    }
    const amountResult: Result<Money, DomainError> = Money.create({
      amount: command.amount,
      currency: payment.totalAmount.currency,
    });
    const checkResult: Result<void, DomainError> = amountResult.isFailure
      ? Result.fail(amountResult.getError())
      : payment.checkRefund(amountResult.getValue());
    if (checkResult.isFailure) {
      return Result.fail(checkResult.getError());
    }
    return this.executeRefund({
      command,
      payment,
      amount: amountResult.getValue(),
      idempotencyKey,
    });
  }

  /**
   * Requests the refund from the gateway of the paid charge, then records it.
   */
  private async executeRefund({
    command,
    payment,
    amount,
    idempotencyKey,
  }: {
    readonly command: RefundPaymentCommand;
    readonly payment: Payment;
    readonly amount: Money;
    readonly idempotencyKey: string;
  }): Promise<Result<RefundPaymentOutput, DomainError>> {
    const charge: PaymentTransaction =
      RefundPaymentHandler.findPaidCharge(payment);
    const refundTransactionId: string = randomUUID();
    const gatewayResult: RefundGatewayResult = await this.gatewayRegistry
      .get(charge.gateway)
      .refund({
        paymentId: payment.id.value,
        orderId: payment.orderReference.orderId,
        refundTransactionId,
        originalTransactionId: charge.id,
        originalGatewayTxId: charge.gatewayTxId ?? '',
        amount: amount.amount,
        currency: amount.currency,
        reason: command.reason,
        idempotencyKey,
      });
    if (gatewayResult.status === 'FAILED') {
      return this.executeRecordRefusal({ command, payment, gatewayResult });
    }
    const refundResult: Result<PaymentTransaction, DomainError> =
      payment.applyRefund({
        transactionId: refundTransactionId,
        amount,
        gatewayTxId: gatewayResult.gatewayTxId,
        gateway: charge.gateway,
        channel: charge.channel,
        idempotencyKey,
        rawResponse: gatewayResult.rawResponse,
      });
    if (refundResult.isFailure) {
      return Result.fail(refundResult.getError());
    }
    await this.paymentRepository.save({
      payment,
      auditEntries: this.auditor.buildAuditEntries({
        events: payment.domainEvents,
        actor: {
          actorType: 'ADMIN',
          actorId: command.actorId,
          ipAddress: command.ipAddress,
        },
      }),
    });
    return Result.ok(
      RefundPaymentHandler.toOutput({
        payment,
        refund: refundResult.getValue(),
      }),
    );
  }

  /**
   * Records a refund the gateway refused and returns the matching error.
   */
  private async executeRecordRefusal({
    command,
    payment,
    gatewayResult,
  }: {
    readonly command: RefundPaymentCommand;
    readonly payment: Payment;
    readonly gatewayResult: RefundGatewayResult;
  }): Promise<Result<RefundPaymentOutput, DomainError>> {
    const reason: string = gatewayResult.failureReason ?? 'UNKNOWN';
    await this.auditService.recordProtocolEvent({
      paymentId: payment.id.value,
      action: AUDIT_ACTIONS.REFUND_REJECTED_BY_GATEWAY,
      actorType: 'ADMIN',
      actorId: command.actorId,
      payload: {
        amount: command.amount,
        reason,
        gatewayPayload: gatewayResult.rawResponse,
      },
      ipAddress: command.ipAddress,
    });
    return Result.fail(new GatewayRefundFailedError(reason));
  }

  /**
   * @returns The successful charge; `checkRefund` guarantees there is one.
   */
  private static findPaidCharge(payment: Payment): PaymentTransaction {
    return payment.transactions.find(
      (transaction: PaymentTransaction): boolean =>
        transaction.type === 'CHARGE' && transaction.status === 'SUCCESS',
    ) as PaymentTransaction;
  }

  /**
   * @returns The output describing the payment after a refund.
   */
  private static toOutput({
    payment,
    refund,
  }: {
    readonly payment: Payment;
    readonly refund: PaymentTransaction;
  }): RefundPaymentOutput {
    return {
      paymentId: payment.id.value,
      refundTransactionId: refund.id,
      status: payment.status,
      totalAmount: payment.totalAmount.amount,
      refundedAmount: payment.refundedAmount.amount,
      currency: payment.totalAmount.currency,
    };
  }
}

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DomainError, Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentTransaction } from '../../../domain/entities/payment-transaction.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import type { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { PAYMENT_REPOSITORY_PORT } from '../../../domain/ports/payment-repository.token';
import { RejectedWebhookResult } from '../../../domain/ports/rejected-webhook-result.type';
import { VerifiedWebhookResult } from '../../../domain/ports/verified-webhook-result.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { FinalTransactionStatus } from '../../../domain/types/final-transaction-status.type';
import { AUDIT_ACTIONS } from '../../audit/audit-actions';
import { PaymentAuditService } from '../../audit/payment-audit.service';
import { PaymentDomainEventAuditor } from '../../audit/payment-domain-event-auditor';
import { InvalidWebhookSignatureError } from '../../errors/invalid-webhook-signature.error';
import { MalformedWebhookError } from '../../errors/malformed-webhook.error';
import type { PaymentGatewayRegistryPort } from '../../ports/payment-gateway-registry.port';
import { PAYMENT_GATEWAY_REGISTRY_PORT } from '../../ports/payment-gateway-registry.token';
import { ProcessWebhookCommand } from './process-webhook.command';

/** Request headers kept as audit metadata of a rejected webhook. */
const AUDITED_HEADERS: readonly string[] = ['user-agent', 'content-type'];

/**
 * Applies a gateway notification (asynchronous webhook model):
 * 1. the gateway adapter authenticates and decodes it; a bad signature or payload is recorded by
 *    {@link PaymentAuditService} (`WEBHOOK_SIGNATURE_MISMATCH` / `WEBHOOK_PAYLOAD_MALFORMED`) and rejected;
 * 2. a charge that is already SUCCESS, FAILED or CANCELLED is left untouched and the call succeeds, so the
 *    gateway's retries are acknowledged (idempotent 200);
 * 3. otherwise the aggregate applies the result and the payment, its ledger entry, the audit rows and the
 *    `payment.succeeded` / `payment.failed` outbox message are saved in one transaction (CLAUDE.md §3.2).
 * Concurrent deliveries are serialised by the payment version: the loser gets a conflict and the gateway's
 * retry then finds the charge final.
 */
@CommandHandler(ProcessWebhookCommand)
export class ProcessWebhookHandler implements ICommandHandler<
  ProcessWebhookCommand,
  Result<void, DomainError>
> {
  private readonly logger: Logger = new Logger(ProcessWebhookHandler.name);

  /**
   * @param paymentRepository - Payment persistence with transactional outbox.
   * @param gatewayRegistry - Gateway adapters.
   * @param auditor - Turns domain events into activity rows.
   * @param auditService - Records protocol activities.
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
   * @param command - Gateway, headers, raw body and caller IP.
   * @returns Success (also for a charge that is already final), or why the notification is rejected.
   */
  public async execute(
    command: ProcessWebhookCommand,
  ): Promise<Result<void, DomainError>> {
    const adapter: PaymentGatewayPort = this.gatewayRegistry.get(
      command.gateway,
    );
    const result: WebhookResult = await adapter.verifyWebhook(
      command.headers,
      command.rawBody,
    );
    if (!result.isVerified) {
      return this.executeReject({ command, rejection: result });
    }
    if (result.status === 'PENDING') {
      return Result.ok();
    }
    const payment: Payment | undefined =
      await this.paymentRepository.findByTransactionId(result.transactionId);
    if (payment === undefined) {
      return Result.fail(new PaymentNotFoundError(result.transactionId));
    }
    return this.executeApply({
      command,
      payment,
      result: { ...result, status: result.status },
    });
  }

  /**
   * Records the rejected notification and returns the matching error.
   */
  private async executeReject({
    command,
    rejection,
  }: {
    readonly command: ProcessWebhookCommand;
    readonly rejection: RejectedWebhookResult;
  }): Promise<Result<void, DomainError>> {
    await this.auditService.recordWebhookRejection({
      gateway: command.gateway,
      rejection,
      ipAddress: command.ipAddress,
      requestMetadata: Object.fromEntries(
        AUDITED_HEADERS.filter(
          (name: string): boolean => command.headers[name] !== undefined,
        ).map((name: string): [string, string] => [
          name,
          command.headers[name],
        ]),
      ),
    });
    return Result.fail(
      rejection.reason === 'SIGNATURE_MISMATCH'
        ? new InvalidWebhookSignatureError()
        : new MalformedWebhookError(),
    );
  }

  /**
   * Applies a verified final result to the payment and saves it, unless the charge is already final.
   */
  private async executeApply({
    command,
    payment,
    result,
  }: {
    readonly command: ProcessWebhookCommand;
    readonly payment: Payment;
    readonly result: VerifiedWebhookResult & {
      readonly status: FinalTransactionStatus;
    };
  }): Promise<Result<void, DomainError>> {
    const charge: PaymentTransaction | undefined = payment.findTransaction({
      transactionId: result.transactionId,
    });
    if (charge?.isFinal() === true) {
      this.logger.log(
        `Transaction ${charge.id} is already ${charge.status}; ${command.gateway} webhook ${result.gatewayTxId} acknowledged`,
      );
      return Result.ok();
    }
    const appliedResult: Result<void, DomainError> =
      payment.applyTransactionResult({
        lookup: { transactionId: result.transactionId },
        result,
      });
    if (appliedResult.isFailure) {
      await this.saveRejectedResult({
        command,
        payment,
        result,
        appliedResult,
      });
      return appliedResult;
    }
    await this.paymentRepository.save({
      payment,
      auditEntries: this.auditor.buildAuditEntries({
        events: payment.domainEvents,
        actor: {
          actorType: 'GATEWAY',
          actorId: command.gateway,
          ipAddress: command.ipAddress,
        },
      }),
    });
    return Result.ok();
  }

  /**
   * Records an authentic notification the aggregate refused (e.g. a wrong amount).
   */
  private async saveRejectedResult({
    command,
    payment,
    result,
    appliedResult,
  }: {
    readonly command: ProcessWebhookCommand;
    readonly payment: Payment;
    readonly result: VerifiedWebhookResult;
    readonly appliedResult: Result<void, DomainError>;
  }): Promise<void> {
    await this.auditService.recordProtocolEvent({
      paymentId: payment.id.value,
      transactionId: result.transactionId,
      action: AUDIT_ACTIONS.WEBHOOK_REJECTED,
      actorType: 'GATEWAY',
      actorId: command.gateway,
      payload: {
        code: appliedResult.getError().code,
        message: appliedResult.getError().message,
        gatewayPayload: result.rawResponse,
      },
      ipAddress: command.ipAddress,
    });
  }
}

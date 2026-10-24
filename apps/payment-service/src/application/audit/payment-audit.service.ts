import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditLogPort } from '../ports/audit-log.port';
import { AUDIT_LOG_PORT } from '../ports/audit-log.token';
import type { PaymentReadPort } from '../ports/payment-read.port';
import { PAYMENT_READ_PORT } from '../ports/payment-read.token';
import { sanitizeAuditPayload } from '../utils/sanitize-audit-payload.util';
import { AUDIT_ACTIONS } from './audit-actions';
import { RecordProtocolEventInput } from './record-protocol-event.input';
import { RecordWebhookRejectionInput } from './record-webhook-rejection.input';

/** RFC 9562 UUID, used before looking up a claimed reference. */
const UUID_PATTERN: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Records protocol and security activities that are not domain changes (bad signatures, malformed
 * payloads, gateway refusals) in the payment activity log, with the caller IP and request metadata.
 * Payloads are sanitised. A rejected webhook is attached to the payment its (untrusted) reference
 * claims; when no payment matches, it is only logged, since every activity row belongs to a payment.
 */
@Injectable()
export class PaymentAuditService {
  private readonly logger: Logger = new Logger(PaymentAuditService.name);

  /**
   * @param auditLog - Activity log writer.
   * @param paymentRead - Resolves the payment a reference belongs to.
   */
  public constructor(
    @Inject(AUDIT_LOG_PORT) private readonly auditLog: AuditLogPort,
    @Inject(PAYMENT_READ_PORT) private readonly paymentRead: PaymentReadPort,
  ) {}

  /**
   * Records `WEBHOOK_SIGNATURE_MISMATCH` or `WEBHOOK_PAYLOAD_MALFORMED`.
   *
   * @param input - Gateway, rejection, caller IP and request metadata.
   */
  public async recordWebhookRejection({
    gateway,
    rejection,
    ipAddress,
    requestMetadata,
  }: RecordWebhookRejectionInput): Promise<void> {
    const paymentId: string | undefined = await this.findClaimedPaymentId(
      rejection.claimedTransactionId,
    );
    if (paymentId === undefined) {
      this.logger.warn(
        `Rejected ${gateway} webhook (${rejection.reason}) from ${ipAddress ?? 'unknown'} matches no payment`,
      );
      return;
    }
    await this.recordProtocolEvent({
      paymentId,
      transactionId: rejection.claimedTransactionId,
      action:
        rejection.reason === 'SIGNATURE_MISMATCH'
          ? AUDIT_ACTIONS.WEBHOOK_SIGNATURE_MISMATCH
          : AUDIT_ACTIONS.WEBHOOK_PAYLOAD_MALFORMED,
      actorType: 'GATEWAY',
      actorId: gateway,
      payload: {
        reason: rejection.reason,
        claimedPayload: rejection.rawResponse ?? null,
        request: requestMetadata ?? null,
      },
      ipAddress,
    });
  }

  /**
   * Appends one sanitised activity row.
   *
   * @param input - Payment, action, actor, details and caller IP.
   */
  public async recordProtocolEvent(
    input: RecordProtocolEventInput,
  ): Promise<void> {
    await this.auditLog.append({
      ...input,
      payload:
        input.payload === undefined
          ? undefined
          : (sanitizeAuditPayload(input.payload) as Record<string, unknown>),
      occurredAt: Date.now(),
    });
  }

  /**
   * @returns The payment of a claimed transaction reference, if it names one.
   */
  private async findClaimedPaymentId(
    claimedTransactionId: string | undefined,
  ): Promise<string | undefined> {
    if (
      claimedTransactionId === undefined ||
      !UUID_PATTERN.test(claimedTransactionId)
    ) {
      return undefined;
    }
    return this.paymentRead.findPaymentIdByTransactionId(claimedTransactionId);
  }
}

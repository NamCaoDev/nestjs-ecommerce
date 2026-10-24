import { AuditEntry } from '../../../domain/ports/audit-entry.type';
import { Prisma } from '../prisma/generated/client';
import { toJsonInput } from '../payment/to-json-input.util';

/**
 * Maps activity entries to `payment_audit_logs` rows.
 */
export class AuditLogRowMapper {
  /**
   * @param entry - Activity entry.
   * @returns The row to insert.
   */
  public static toCreateInput(
    entry: AuditEntry,
  ): Prisma.PaymentAuditLogCreateManyInput {
    return {
      paymentId: entry.paymentId,
      transactionId: entry.transactionId ?? null,
      action: entry.action,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      stateFrom: entry.stateFrom ?? null,
      stateTo: entry.stateTo ?? null,
      payload: toJsonInput(entry.payload),
      ipAddress: entry.ipAddress ?? null,
      createdAt: new Date(entry.occurredAt),
    };
  }
}

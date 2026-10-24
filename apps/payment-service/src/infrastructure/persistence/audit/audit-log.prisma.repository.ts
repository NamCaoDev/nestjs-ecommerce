import { Injectable } from '@nestjs/common';
import { AuditLogPort } from '../../../application/ports/audit-log.port';
import { AuditEntry } from '../../../domain/ports/audit-entry.type';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogRowMapper } from './audit-log-row.mapper';

/**
 * Prisma implementation of {@link AuditLogPort}: appends to `payment_audit_logs` (append-only table).
 */
@Injectable()
export class AuditLogPrismaRepository implements AuditLogPort {
  /**
   * @param prisma - Client for `payment_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param entry - Activity row.
   */
  public async append(entry: AuditEntry): Promise<void> {
    await this.prisma.client.paymentAuditLog.create({
      data: AuditLogRowMapper.toCreateInput(entry),
    });
  }
}

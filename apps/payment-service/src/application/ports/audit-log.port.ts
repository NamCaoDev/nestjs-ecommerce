import { AuditEntry } from '../../domain/ports/audit-entry.type';

/**
 * Appends protocol and security activities (outside any aggregate change) to the payment activity log.
 * Injected with {@link AUDIT_LOG_PORT}.
 */
export interface AuditLogPort {
  /**
   * @param entry - Activity row.
   */
  append(entry: AuditEntry): Promise<void>;
}

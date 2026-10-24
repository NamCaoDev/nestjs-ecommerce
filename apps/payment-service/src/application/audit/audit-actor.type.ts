import { PaymentActorType } from '../../domain/types/payment-actor-type.type';

/**
 * Who caused the domain events being audited, and from where.
 */
export interface AuditActor {
  readonly actorType: PaymentActorType;
  /** e.g. the gateway name, a consumer name or an operator id. */
  readonly actorId?: string;
  readonly ipAddress?: string;
}

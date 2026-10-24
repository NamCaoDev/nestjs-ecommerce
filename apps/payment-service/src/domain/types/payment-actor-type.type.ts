/**
 * Who caused an audited activity; mirrors the `payment_actor_type` database enum.
 */
export type PaymentActorType = 'SYSTEM' | 'GATEWAY' | 'CUSTOMER' | 'ADMIN';

import { AggregateRoot, DomainEvent } from '@org/shared-domain';
import { Payment } from '../../domain/aggregates/payment.aggregate';
import { AuditEntry } from '../../domain/ports/audit-entry.type';
import { Money } from '../../domain/value-objects/money.vo';
import { OrderReference } from '../../domain/value-objects/order-reference.vo';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { PaymentDomainEventAuditor } from './payment-domain-event-auditor';
import { PaymentInitiatedAuditHandler } from './payment-initiated.audit-handler';
import { PaymentStatusChangedAuditHandler } from './payment-status-changed.audit-handler';
import { PaymentTransactionFinalizedAuditHandler } from './payment-transaction-finalized.audit-handler';

const PAYMENT_ID = '0199a7c0-0000-7000-8000-0000000000f1';
const CHARGE_ID = '0199a7c0-0000-7000-8000-0000000000e1';

/**
 * Plays a full payment (initiate, then a SUCCESS result) and returns its pending events.
 */
const createPaymentEvents = (): readonly DomainEvent[] => {
  const payment: Payment = Payment.create({
    id: PaymentId.create(PAYMENT_ID).getValue(),
    orderReference: OrderReference.create({
      orderId: '0199a7c0-0000-7000-8000-000000000001',
      customerId: '0199a7c0-0000-7000-8000-0000000000c1',
      lines: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 1 }],
    }).getValue(),
    totalAmount: Money.create({ amount: 10, currency: 'USD' }).getValue(),
  }).getValue();
  payment.initiateCharge({
    transactionId: CHARGE_ID,
    gateway: 'MOCK',
    channel: 'QR_CODE',
    idempotencyKey: 'charge:event-1',
  });
  payment.applyTransactionResult({
    lookup: { transactionId: CHARGE_ID },
    result: { status: 'SUCCESS', gatewayTxId: 'tx-1', amount: 10 },
  });
  return (payment as AggregateRoot<PaymentId>).domainEvents;
};

describe('PaymentDomainEventAuditor', () => {
  const auditor: PaymentDomainEventAuditor = new PaymentDomainEventAuditor(
    new PaymentInitiatedAuditHandler(),
    new PaymentTransactionFinalizedAuditHandler(),
    new PaymentStatusChangedAuditHandler(),
  );
  it('should record one activity per domain event, in order, with the actor', () => {
    // Arrange
    const inputEvents: readonly DomainEvent[] = createPaymentEvents();
    // Act
    const actualEntries: AuditEntry[] = auditor.buildAuditEntries({
      events: inputEvents,
      actor: { actorType: 'GATEWAY', actorId: 'MOCK', ipAddress: '10.0.0.1' },
    });
    // Assert
    expect(actualEntries).toEqual([
      expect.objectContaining({
        paymentId: PAYMENT_ID,
        transactionId: CHARGE_ID,
        action: 'PAYMENT_INITIATED',
        stateTo: 'PENDING',
        actorType: 'GATEWAY',
        actorId: 'MOCK',
        ipAddress: '10.0.0.1',
        payload: expect.objectContaining({ gateway: 'MOCK', amount: 10 }),
      }),
      expect.objectContaining({
        action: 'TRANSACTION_FINALIZED',
        stateFrom: 'PENDING',
        stateTo: 'SUCCESS',
        payload: expect.objectContaining({
          gatewayTxId: 'tx-1',
          type: 'CHARGE',
        }),
      }),
      expect.objectContaining({
        action: 'STATE_CHANGED',
        stateFrom: 'PENDING',
        stateTo: 'PAID',
        payload: expect.objectContaining({
          totalAmount: 10,
          refundedAmount: 0,
        }),
      }),
    ]);
  });
  it('should ignore events no handler records', () => {
    // Arrange
    const inputEvent: DomainEvent = {
      eventId: 'e1',
      eventName: 'payment.other',
      aggregateId: PAYMENT_ID,
      occurredAt: 1,
    };
    // Act
    const actualEntries: AuditEntry[] = auditor.buildAuditEntries({
      events: [inputEvent],
      actor: { actorType: 'SYSTEM' },
    });
    // Assert
    expect(actualEntries).toEqual([]);
  });
});

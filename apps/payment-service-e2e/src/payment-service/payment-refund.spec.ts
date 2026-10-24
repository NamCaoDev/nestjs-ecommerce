import axios, { AxiosResponse } from 'axios';
import { SagaFixture } from '../support/saga/saga-fixture';
import { SagaInfrastructure } from '../support/saga/saga-infrastructure';

/**
 * Acceptance test of `POST /api/payments/:id/refunds`: a partial refund keeps `total_amount`, raises
 * `refunded_amount`, appends a REFUND ledger entry and makes the payment PARTIALLY_REFUNDED; the
 * Idempotency-Key makes replays harmless and the total can never be exceeded.
 */
const SCENARIO_TIMEOUT_MS = 120_000;

/**
 * Requests a refund with the given key and amount.
 */
const postRefund = ({
  paymentId,
  idempotencyKey,
  amount,
}: {
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly amount: number;
}): Promise<AxiosResponse<Record<string, unknown>>> =>
  axios.post(
    `/api/payments/${paymentId}/refunds`,
    { amount, reason: 'Damaged item' },
    {
      headers: { 'Idempotency-Key': idempotencyKey, 'x-actor-id': 'agent-7' },
      validateStatus: (): boolean => true,
    },
  );

describe('Refunds', () => {
  const infrastructure: SagaInfrastructure = new SagaInfrastructure();
  const fixture: SagaFixture = new SagaFixture(infrastructure);
  let paymentId: string = '';
  beforeAll(async () => {
    await fixture.saveStock();
    await fixture.executePlaceOrder();
    await fixture.waitForPayment('PENDING');
    await axios.post('/api/payments/mock-gateway/pay', {
      orderId: fixture.orderId,
      status: 'SUCCESS',
    });
    paymentId = String((await fixture.waitForPayment('PAID'))['paymentId']);
  }, SCENARIO_TIMEOUT_MS);
  afterAll(async () => {
    await fixture.executeCleanUp();
    await infrastructure.executeClose();
  });
  it('should refund part of a paid payment without touching its total', async () => {
    // Given a payment of 10 USD that is PAID
    // When 4 USD are refunded
    const actualResponse: AxiosResponse<Record<string, unknown>> =
      await postRefund({ paymentId, idempotencyKey: 'refund-1', amount: 4 });
    // Then the payment is PARTIALLY_REFUNDED with its total unchanged
    expect(actualResponse.status).toBe(200);
    expect(actualResponse.data).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
      totalAmount: 10,
      refundedAmount: 4,
    });
    const actualRow: {
      rows: { total_amount: string; refunded_amount: string; status: string }[];
    } = await infrastructure.paymentDb.query(
      'SELECT total_amount, refunded_amount, status FROM payments WHERE id = $1',
      [paymentId],
    );
    expect(actualRow.rows[0]).toEqual({
      total_amount: '10.0000',
      refunded_amount: '4.0000',
      status: 'PARTIALLY_REFUNDED',
    });
    // And the ledger holds the charge and a SUCCESS refund
    const actualLedger: {
      rows: { type: string; status: string; amount: string }[];
    } = await infrastructure.paymentDb.query(
      'SELECT type, status, amount FROM payment_transactions WHERE payment_id = $1 ORDER BY created_at',
      [paymentId],
    );
    expect(actualLedger.rows).toEqual([
      { type: 'CHARGE', status: 'SUCCESS', amount: '10.0000' },
      { type: 'REFUND', status: 'SUCCESS', amount: '4.0000' },
    ]);
  });
  it('should return the recorded refund for a replayed Idempotency-Key', async () => {
    // Given the refund of 4 USD recorded under refund-1
    // When the same request is replayed
    const actualResponse: AxiosResponse<Record<string, unknown>> =
      await postRefund({ paymentId, idempotencyKey: 'refund-1', amount: 4 });
    // Then nothing more is refunded
    expect(actualResponse.data).toMatchObject({ refundedAmount: 4 });
  });
  it('should refuse a refund above the refundable amount', async () => {
    // Given 6 USD still refundable
    // When 6.01 USD are requested
    const actualResponse: AxiosResponse<Record<string, unknown>> =
      await postRefund({ paymentId, idempotencyKey: 'refund-2', amount: 6.01 });
    // Then it is refused
    expect(actualResponse.status).toBe(400);
    expect(actualResponse.data['code']).toBe('PAYMENT.REFUND_EXCEEDS_TOTAL');
  });
  it('should become REFUNDED when the rest is refunded and log every change by the operator', async () => {
    // Given 6 USD still refundable
    // When the remaining 6 USD are refunded
    const actualResponse: AxiosResponse<Record<string, unknown>> =
      await postRefund({ paymentId, idempotencyKey: 'refund-3', amount: 6 });
    // Then the payment is REFUNDED and the total is still 10
    expect(actualResponse.data).toMatchObject({
      status: 'REFUNDED',
      totalAmount: 10,
      refundedAmount: 10,
    });
    // And the activity log records both refunds by the operator
    const actualActivities: AxiosResponse<Record<string, unknown>[]> =
      await axios.get(`/api/payments/${paymentId}/activities`);
    expect(
      actualActivities.data
        .filter(
          (activity: Record<string, unknown>): boolean =>
            activity['actorId'] === 'agent-7',
        )
        .map(
          (activity: Record<string, unknown>): string =>
            `${String(activity['action'])}:${String(activity['stateTo'])}`,
        ),
    ).toEqual([
      'TRANSACTION_FINALIZED:SUCCESS',
      'STATE_CHANGED:PARTIALLY_REFUNDED',
      'TRANSACTION_FINALIZED:SUCCESS',
      'STATE_CHANGED:REFUNDED',
    ]);
  });
});

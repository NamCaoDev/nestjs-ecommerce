import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { SagaInfrastructure } from '../support/saga/saga-infrastructure';

/**
 * Integration test of the database triggers that make the payment ledger and activity log
 * append-only, whatever the client: finalised `payment_transactions` rows and every
 * `payment_audit_logs` row reject UPDATE, DELETE and TRUNCATE.
 */
describe('Append-only ledger and activity log (PostgreSQL triggers)', () => {
  const infrastructure: SagaInfrastructure = new SagaInfrastructure();
  const paymentDb: Pool = infrastructure.paymentDb;
  const paymentId: string = randomUUID();
  const succeededId: string = randomUUID();
  const failedId: string = randomUUID();
  const pendingId: string = randomUUID();
  let auditId: string = '';
  beforeAll(async () => {
    await paymentDb.query(
      `INSERT INTO payments (id, order_id, customer_id, total_amount, currency, status, line_items, updated_at)
       VALUES ($1, $2, $3, 10, 'USD', 'PAID', '[]', now())`,
      [paymentId, randomUUID(), randomUUID()],
    );
    await paymentDb.query(
      `INSERT INTO payment_transactions (id, payment_id, type, gateway, amount, status, gateway_tx_id, idempotency_key)
       VALUES ($1::uuid, $4, 'CHARGE', 'MOCK', 10, 'SUCCESS', 'tx-1', $1::text),
              ($2::uuid, $4, 'CHARGE', 'MOCK', 10, 'FAILED', 'tx-2', $2::text),
              ($3::uuid, $4, 'CHARGE', 'MOCK', 10, 'PENDING', NULL, $3::text)`,
      [succeededId, failedId, pendingId, paymentId],
    );
    auditId = randomUUID();
    await paymentDb.query(
      `INSERT INTO payment_audit_logs (id, payment_id, action, actor_type) VALUES ($1, $2, 'STATE_CHANGED', 'SYSTEM')`,
      [auditId, paymentId],
    );
  });
  afterAll(async () => {
    await infrastructure.executeClose();
  });
  it.each([
    {
      description: 'UPDATE a SUCCESS entry',
      sql: "UPDATE payment_transactions SET status = 'FAILED' WHERE id = $1",
      entry: 'succeeded',
    },
    {
      description: 'UPDATE the amount of a SUCCESS entry',
      sql: 'UPDATE payment_transactions SET amount = 1 WHERE id = $1',
      entry: 'succeeded',
    },
    {
      description: 'DELETE a SUCCESS entry',
      sql: 'DELETE FROM payment_transactions WHERE id = $1',
      entry: 'succeeded',
    },
    {
      description: 'UPDATE a FAILED entry',
      sql: "UPDATE payment_transactions SET status = 'SUCCESS' WHERE id = $1",
      entry: 'failed',
    },
    {
      description: 'DELETE a FAILED entry',
      sql: 'DELETE FROM payment_transactions WHERE id = $1',
      entry: 'failed',
    },
  ])('should refuse to $description', async ({ sql, entry }) => {
    // Given a finalised ledger entry
    const entryId: string = entry === 'succeeded' ? succeededId : failedId;
    // When a client changes it directly in SQL
    const actualQuery: Promise<unknown> = paymentDb.query(sql, [entryId]);
    // Then PostgreSQL raises an exception and the row is unchanged
    await expect(actualQuery).rejects.toThrow(
      /immutable \(append-only ledger\)/,
    );
    const actualRow: { rows: { status: string; amount: string }[] } =
      await paymentDb.query(
        'SELECT status, amount FROM payment_transactions WHERE id = $1',
        [entryId],
      );
    expect(actualRow.rows[0]).toEqual({
      status: entry === 'succeeded' ? 'SUCCESS' : 'FAILED',
      amount: '10.0000',
    });
  });
  it('should let a PENDING entry be finalised but not have its amount changed', async () => {
    // Given a PENDING ledger entry
    // When its amount is changed, then its outcome is recorded
    const actualAmountChange: Promise<unknown> = paymentDb.query(
      'UPDATE payment_transactions SET amount = 1 WHERE id = $1',
      [pendingId],
    );
    await expect(actualAmountChange).rejects.toThrow(
      /only the outcome of a PENDING entry can change/,
    );
    await paymentDb.query(
      "UPDATE payment_transactions SET status = 'SUCCESS', gateway_tx_id = 'tx-3' WHERE id = $1",
      [pendingId],
    );
    // Then the outcome is stored and the entry is now immutable
    const actualDelete: Promise<unknown> = paymentDb.query(
      'DELETE FROM payment_transactions WHERE id = $1',
      [pendingId],
    );
    await expect(actualDelete).rejects.toThrow(/immutable/);
  });
  it.each([
    {
      description: 'UPDATE',
      sql: "UPDATE payment_audit_logs SET action = 'TAMPERED' WHERE id = $1",
    },
    {
      description: 'DELETE',
      sql: 'DELETE FROM payment_audit_logs WHERE id = $1',
    },
  ])('should refuse to $description an activity row', async ({ sql }) => {
    // Given an activity row
    // When a client changes it directly in SQL
    const actualQuery: Promise<unknown> = paymentDb.query(sql, [auditId]);
    // Then PostgreSQL raises an exception
    await expect(actualQuery).rejects.toThrow(
      /payment_audit_logs is append-only/,
    );
  });
  it.each(['payment_transactions', 'payment_audit_logs'])(
    'should refuse to TRUNCATE %s',
    async (inputTable: string) => {
      // Given an append-only table
      // When a client truncates it
      const actualQuery: Promise<unknown> = paymentDb.query(
        `TRUNCATE ${inputTable} CASCADE`,
      );
      // Then PostgreSQL raises an exception
      await expect(actualQuery).rejects.toThrow(/TRUNCATE is forbidden/);
    },
  );
  it('should refuse a refunded amount above the total', async () => {
    // Given a payment of 10
    // When its refunded amount is set to 11
    const actualQuery: Promise<unknown> = paymentDb.query(
      'UPDATE payments SET refunded_amount = 11 WHERE id = $1',
      [paymentId],
    );
    // Then the CHECK constraint rejects it
    await expect(actualQuery).rejects.toThrow(/payments_refunded_amount_range/);
  });
});

import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { SagaInfrastructure } from '../support/saga/saga-infrastructure';

/**
 * Integration test of the database guards of payment_db, whatever the client:
 * - the ledger and the activity log are append-only (UPDATE / DELETE / TRUNCATE rejected);
 * - ledger entries start in their only allowed status (CHARGE PENDING, REFUND SUCCESS);
 * - payments follow the state machine, never lose refunds, never change what is owed, are never deleted;
 * - at COMMIT, the status and refunded amount of a payment must match its ledger.
 */
describe('payment_db guards (PostgreSQL triggers and constraints)', () => {
  const infrastructure: SagaInfrastructure = new SagaInfrastructure();
  const paymentDb: Pool = infrastructure.paymentDb;
  /**
   * Runs statements in one transaction (deferred constraints are checked at COMMIT).
   */
  const executeInTransaction = async (
    statements: ReadonlyArray<readonly [string, readonly unknown[]]>,
  ): Promise<void> => {
    const client: PoolClient = await paymentDb.connect();
    try {
      await client.query('BEGIN');
      for (const [sql, params] of statements) {
        await client.query(sql, [...params]);
      }
      await client.query('COMMIT');
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
  /**
   * Creates a 10 USD payment with one PENDING charge, through the allowed path.
   *
   * @returns The payment and charge ids.
   */
  const createPendingPayment = async (): Promise<{
    paymentId: string;
    chargeId: string;
  }> => {
    const paymentId: string = randomUUID();
    const chargeId: string = randomUUID();
    await executeInTransaction([
      [
        `INSERT INTO payments (id, order_id, customer_id, total_amount, currency, line_items, updated_at)
         VALUES ($1, $2, $3, 10, 'USD', '[]', now())`,
        [paymentId, randomUUID(), randomUUID()],
      ],
      [
        `INSERT INTO payment_transactions (id, payment_id, type, gateway, amount, idempotency_key)
         VALUES ($1::uuid, $2, 'CHARGE', 'MOCK', 10, $1::text)`,
        [chargeId, paymentId],
      ],
    ]);
    return { paymentId, chargeId };
  };
  /**
   * Finalises the charge and the payment together, as the application does.
   */
  const executeSettle = (
    { paymentId, chargeId }: { paymentId: string; chargeId: string },
    outcome: 'SUCCESS' | 'FAILED',
  ): Promise<void> =>
    executeInTransaction([
      [
        `UPDATE payment_transactions SET status = $2, gateway_tx_id = 'tx-' || $1 WHERE id = $1`,
        [chargeId, outcome],
      ],
      [
        `UPDATE payments SET status = $2, version = version + 1 WHERE id = $1`,
        [paymentId, outcome === 'SUCCESS' ? 'PAID' : 'FAILED'],
      ],
    ]);
  let paid: { paymentId: string; chargeId: string };
  let failed: { paymentId: string; chargeId: string };
  let auditId: string = '';
  beforeAll(async () => {
    paid = await createPendingPayment();
    await executeSettle(paid, 'SUCCESS');
    failed = await createPendingPayment();
    await executeSettle(failed, 'FAILED');
    auditId = randomUUID();
    await paymentDb.query(
      `INSERT INTO payment_audit_logs (id, payment_id, action, actor_type) VALUES ($1, $2, 'STATE_CHANGED', 'SYSTEM')`,
      [auditId, paid.paymentId],
    );
  });
  afterAll(async () => {
    await infrastructure.executeClose();
  });
  describe('append-only ledger', () => {
    it.each([
      {
        description: 'UPDATE a SUCCESS entry',
        sql: "UPDATE payment_transactions SET status = 'FAILED' WHERE id = $1",
        entry: 'paid',
      },
      {
        description: 'UPDATE the amount of a SUCCESS entry',
        sql: 'UPDATE payment_transactions SET amount = 1 WHERE id = $1',
        entry: 'paid',
      },
      {
        description: 'DELETE a SUCCESS entry',
        sql: 'DELETE FROM payment_transactions WHERE id = $1',
        entry: 'paid',
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
      const entryId: string =
        entry === 'paid' ? paid.chargeId : failed.chargeId;
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
        status: entry === 'paid' ? 'SUCCESS' : 'FAILED',
        amount: '10.0000',
      });
    });
    it('should refuse to change the amount of a PENDING entry', async () => {
      // Given a PENDING charge
      const { chargeId } = await createPendingPayment();
      // When its amount is changed
      const actualQuery: Promise<unknown> = paymentDb.query(
        'UPDATE payment_transactions SET amount = 1 WHERE id = $1',
        [chargeId],
      );
      // Then PostgreSQL raises an exception
      await expect(actualQuery).rejects.toThrow(
        /only the outcome of a PENDING entry can change/,
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
  });
  describe('initial statuses', () => {
    it('should refuse a CHARGE created in a final status', async () => {
      // Given a payment
      const { paymentId } = await createPendingPayment();
      // When a charge is inserted directly as SUCCESS
      const actualQuery: Promise<unknown> = paymentDb.query(
        `INSERT INTO payment_transactions (id, payment_id, type, gateway, amount, status, gateway_tx_id, idempotency_key)
         VALUES ($1::uuid, $2, 'CHARGE', 'MOCK', 10, 'SUCCESS', 'tx-x', $1::text)`,
        [randomUUID(), paymentId],
      );
      // Then PostgreSQL raises an exception
      await expect(actualQuery).rejects.toThrow(/a CHARGE is created PENDING/);
    });
    it('should refuse a REFUND that is not SUCCESS', async () => {
      // Given a paid payment
      // When a PENDING refund is inserted
      const actualQuery: Promise<unknown> = paymentDb.query(
        `INSERT INTO payment_transactions (id, payment_id, type, gateway, amount, status, idempotency_key)
         VALUES ($1::uuid, $2, 'REFUND', 'MOCK', 1, 'PENDING', $1::text)`,
        [randomUUID(), paid.paymentId],
      );
      // Then the CHECK constraint rejects it
      await expect(actualQuery).rejects.toThrow(
        /payment_transactions_refund_is_success/,
      );
    });
    it('should refuse a payment created in another status than PENDING', async () => {
      // Given nothing
      // When a payment is inserted as PAID
      const actualQuery: Promise<unknown> = paymentDb.query(
        `INSERT INTO payments (id, order_id, customer_id, total_amount, currency, status, line_items, updated_at)
         VALUES ($1, $2, $3, 10, 'USD', 'PAID', '[]', now())`,
        [randomUUID(), randomUUID(), randomUUID()],
      );
      // Then PostgreSQL raises an exception
      await expect(actualQuery).rejects.toThrow(/a payment is created PENDING/);
    });
  });
  describe('payment state machine', () => {
    it.each([
      { description: 'PAID → PENDING', target: 'PENDING', source: 'paid' },
      { description: 'PAID → FAILED', target: 'FAILED', source: 'paid' },
      { description: 'FAILED → PAID', target: 'PAID', source: 'failed' },
      { description: 'FAILED → PENDING', target: 'PENDING', source: 'failed' },
    ])(
      'should refuse the transition $description',
      async ({ target, source }) => {
        // Given a payment in a status that cannot move to the target
        const paymentId: string =
          source === 'paid' ? paid.paymentId : failed.paymentId;
        // When its status is changed directly
        const actualQuery: Promise<unknown> = paymentDb.query(
          'UPDATE payments SET status = $2, version = version + 1 WHERE id = $1',
          [paymentId, target],
        );
        // Then PostgreSQL raises an exception
        await expect(actualQuery).rejects.toThrow(
          /status transition .* is not allowed/,
        );
      },
    );
    it.each([
      {
        description: 'the total owed',
        sql: 'UPDATE payments SET total_amount = 9, version = version + 1 WHERE id = $1',
        expected: /immutable/,
      },
      {
        description: 'the order',
        sql: 'UPDATE payments SET order_id = gen_random_uuid(), version = version + 1 WHERE id = $1',
        expected: /immutable/,
      },
      {
        description: 'the row without a new version',
        sql: 'UPDATE payments SET updated_at = now() WHERE id = $1',
        expected: /increment version/,
      },
      {
        description: 'nothing but deletes it',
        sql: 'DELETE FROM payments WHERE id = $1',
        expected: /cannot be deleted/,
      },
    ])(
      'should refuse an update that changes $description',
      async ({ sql, expected }) => {
        // Given a paid payment
        // When a client changes it directly in SQL
        const actualQuery: Promise<unknown> = paymentDb.query(sql, [
          paid.paymentId,
        ]);
        // Then PostgreSQL raises an exception
        await expect(actualQuery).rejects.toThrow(expected);
      },
    );
    it('should refuse a refunded amount above the total', async () => {
      // Given a payment of 10
      // When its refunded amount is set to 11
      const actualQuery: Promise<unknown> = paymentDb.query(
        'UPDATE payments SET refunded_amount = 11, version = version + 1 WHERE id = $1',
        [paid.paymentId],
      );
      // Then the CHECK constraint rejects it
      await expect(actualQuery).rejects.toThrow(
        /payments_refunded_amount_range/,
      );
    });
  });
  describe('payment ↔ ledger consistency at COMMIT', () => {
    it('should refuse to finalise a charge without moving its payment', async () => {
      // Given a PENDING payment with its PENDING charge
      const { chargeId } = await createPendingPayment();
      // When only the charge is marked SUCCESS
      const actualQuery: Promise<unknown> = paymentDb.query(
        "UPDATE payment_transactions SET status = 'SUCCESS', gateway_tx_id = 'tx-only' WHERE id = $1",
        [chargeId],
      );
      // Then the commit fails: the payment would stay PENDING with a successful charge
      await expect(actualQuery).rejects.toThrow(/do not match the ledger/);
    });
    it('should refuse to mark a payment PAID without a successful charge', async () => {
      // Given a PENDING payment with its PENDING charge
      const { paymentId } = await createPendingPayment();
      // When only the payment is marked PAID
      const actualQuery: Promise<unknown> = paymentDb.query(
        "UPDATE payments SET status = 'PAID', version = version + 1 WHERE id = $1",
        [paymentId],
      );
      // Then the commit fails
      await expect(actualQuery).rejects.toThrow(/do not match the ledger/);
    });
    it('should refuse a refunded amount that is not backed by refund entries', async () => {
      // Given a paid payment
      // When it is marked partially refunded without a REFUND entry
      const actualQuery: Promise<void> = executeInTransaction([
        [
          "UPDATE payments SET status = 'PARTIALLY_REFUNDED', refunded_amount = 4, version = version + 1 WHERE id = $1",
          [paid.paymentId],
        ],
      ]);
      // Then the commit fails
      await expect(actualQuery).rejects.toThrow(/do not match the ledger/);
    });
    it('should accept a refund written together with its ledger entry', async () => {
      // Given a paid payment
      const settled: { paymentId: string; chargeId: string } =
        await createPendingPayment();
      await executeSettle(settled, 'SUCCESS');
      const refundId: string = randomUUID();
      // When the REFUND entry and the payment change are written in one transaction
      await executeInTransaction([
        [
          "UPDATE payments SET status = 'PARTIALLY_REFUNDED', refunded_amount = 4, version = version + 1 WHERE id = $1",
          [settled.paymentId],
        ],
        [
          `INSERT INTO payment_transactions (id, payment_id, type, gateway, amount, status, gateway_tx_id, idempotency_key)
           VALUES ($1::uuid, $2, 'REFUND', 'MOCK', 4, 'SUCCESS', 'rf-1', $1::text)`,
          [refundId, settled.paymentId],
        ],
      ]);
      // Then both are stored, and refunded_amount can no longer decrease
      const actualRow: { rows: { status: string; refunded_amount: string }[] } =
        await paymentDb.query(
          'SELECT status, refunded_amount FROM payments WHERE id = $1',
          [settled.paymentId],
        );
      expect(actualRow.rows[0]).toEqual({
        status: 'PARTIALLY_REFUNDED',
        refunded_amount: '4.0000',
      });
      const actualDecrease: Promise<unknown> = paymentDb.query(
        'UPDATE payments SET refunded_amount = 3, version = version + 1 WHERE id = $1',
        [settled.paymentId],
      );
      await expect(actualDecrease).rejects.toThrow(
        /refunded_amount cannot decrease/,
      );
    });
  });
});

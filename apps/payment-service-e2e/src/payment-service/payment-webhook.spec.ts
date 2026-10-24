import axios, { AxiosResponse } from 'axios';
import { SagaFixture } from '../support/saga/saga-fixture';
import { SagaInfrastructure } from '../support/saga/saga-infrastructure';
import { signWebhook } from '../support/saga/sign-webhook.util';

/**
 * Acceptance test of `POST /api/payments/webhook/mock`: the HMAC-SHA256 signature of the raw body is
 * required, every rejection is recorded in the payment activity log, a final charge acknowledges
 * retries unchanged, and an authentic result with a wrong amount is refused.
 */
const SCENARIO_TIMEOUT_MS = 120_000;

/** Response of the webhook endpoint. */
type WebhookResponse = AxiosResponse<Record<string, unknown>>;

/**
 * Sends a webhook body with the given signature header.
 */
const postWebhook = ({
  rawBody,
  signature,
}: {
  readonly rawBody: string;
  readonly signature: string;
}): Promise<WebhookResponse> =>
  axios.post('/api/payments/webhook/mock', rawBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': signature,
    },
    validateStatus: (): boolean => true,
  });

describe('POST /api/payments/webhook/mock', () => {
  const infrastructure: SagaInfrastructure = new SagaInfrastructure();
  const fixture: SagaFixture = new SagaFixture(infrastructure);
  let transactionId: string = '';
  let paymentId: string = '';
  beforeAll(async () => {
    await fixture.saveStock();
    await fixture.executePlaceOrder();
    const payment: Record<string, unknown> =
      await fixture.waitForPayment('PENDING');
    paymentId = String(payment['paymentId']);
    transactionId = String(
      (payment['transactions'] as { transactionId: string }[])[0].transactionId,
    );
  }, SCENARIO_TIMEOUT_MS);
  afterAll(async () => {
    await fixture.executeCleanUp();
    await infrastructure.executeClose();
  });
  /**
   * Serialises a MOCK webhook body for the charge.
   */
  const createBody = (fields: Record<string, unknown> = {}): string =>
    JSON.stringify({
      transactionId,
      orderId: fixture.orderId,
      gatewayTxId: 'tx-signed-1',
      status: 'SUCCESS',
      amount: 10,
      ...fields,
    });
  it('should reject a tampered webhook and record WEBHOOK_SIGNATURE_MISMATCH with the caller IP', async () => {
    // Given a body signed by the gateway for a failed payment
    const signedBody: string = createBody({ status: 'FAILED' });
    const signature: string = signWebhook(signedBody);
    // When the body is altered in transit to report a success
    const actualResponse: WebhookResponse = await postWebhook({
      rawBody: signedBody.replace('FAILED', 'SUCCESS'),
      signature,
    });
    // Then it is rejected with 401
    expect(actualResponse.status).toBe(401);
    expect(actualResponse.data['code']).toBe(
      'PAYMENT.INVALID_WEBHOOK_SIGNATURE',
    );
    // And the attempt is in the activity log of the payment, signature masked
    const actualActivities: AxiosResponse<Record<string, unknown>[]> =
      await axios.get(`/api/payments/${paymentId}/activities`);
    const actualMismatch: Record<string, unknown> | undefined =
      actualActivities.data.find(
        (activity: Record<string, unknown>): boolean =>
          activity['action'] === 'WEBHOOK_SIGNATURE_MISMATCH',
      );
    expect(actualMismatch).toMatchObject({
      paymentId,
      transactionId,
      actorType: 'GATEWAY',
      actorId: 'MOCK',
      ipAddress: expect.stringMatching(/127\.0\.0\.1|::1/),
      payload: expect.objectContaining({ reason: 'SIGNATURE_MISMATCH' }),
    });
    // And the payment is unchanged
    expect(await fixture.waitForPayment('PENDING')).toBeDefined();
  });
  it('should reject a webhook without signature', async () => {
    // Given a well-formed body
    // When it is sent without the signature header
    const actualResponse: WebhookResponse = await postWebhook({
      rawBody: createBody(),
      signature: '',
    });
    // Then it is rejected
    expect(actualResponse.status).toBe(401);
  });
  it('should reject an authentic result with another amount and record WEBHOOK_REJECTED', async () => {
    // Given a signed success reporting 1 instead of 10
    const rawBody: string = createBody({ amount: 1 });
    // When the gateway delivers it
    const actualResponse: WebhookResponse = await postWebhook({
      rawBody,
      signature: signWebhook(rawBody),
    });
    // Then it is refused and recorded, and the payment stays PENDING
    expect(actualResponse.status).toBe(400);
    expect(actualResponse.data['code']).toBe('PAYMENT.AMOUNT_MISMATCH');
    expect(await fixture.findActivityActions()).toContain('WEBHOOK_REJECTED');
    expect(await fixture.waitForPayment('PENDING')).toBeDefined();
  });
  it(
    'should apply a signed webhook once and acknowledge its retries unchanged',
    async () => {
      // Given a webhook signed by the gateway
      const rawBody: string = createBody();
      const signature: string = signWebhook(rawBody);
      // When the gateway delivers it, retries it, then sends a contradicting result
      const actualFirst: WebhookResponse = await postWebhook({
        rawBody,
        signature,
      });
      const actualRetry: WebhookResponse = await postWebhook({
        rawBody,
        signature,
      });
      const contradictingBody: string = createBody({
        gatewayTxId: 'tx-signed-2',
        status: 'FAILED',
      });
      const actualContradiction: WebhookResponse = await postWebhook({
        rawBody: contradictingBody,
        signature: signWebhook(contradictingBody),
      });
      // Then every delivery is acknowledged with 200
      expect(
        [actualFirst, actualRetry, actualContradiction].map(
          (response: WebhookResponse): number => response.status,
        ),
      ).toEqual([200, 200, 200]);
      expect(actualFirst.data).toEqual({ received: true });
      // And the first result is kept, with a single payment.succeeded in the outbox
      const actualPayment: Record<string, unknown> =
        await fixture.waitForPayment('PAID');
      expect(actualPayment['transactions']).toEqual([
        expect.objectContaining({
          status: 'SUCCESS',
          gatewayTxId: 'tx-signed-1',
        }),
      ]);
      expect(await fixture.findPaymentOutboxEvents()).toEqual([
        'payment.succeeded',
      ]);
    },
    SCENARIO_TIMEOUT_MS,
  );
  it('should answer 404 for a charge it does not know so the gateway retries later', async () => {
    // Given a signed webhook for an unknown charge
    const rawBody: string = createBody({
      transactionId: '0199a7c0-0000-7000-8000-00000000dead',
    });
    // When it is delivered
    const actualResponse: WebhookResponse = await postWebhook({
      rawBody,
      signature: signWebhook(rawBody),
    });
    // Then the payment service answers 404
    expect(actualResponse.status).toBe(404);
    expect(actualResponse.data['code']).toBe('PAYMENT.NOT_FOUND');
  });
});

import { SignedWebhook } from '../../../application/ports/signed-webhook.type';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import { RefundGatewayResult } from '../../../domain/ports/refund-gateway-result.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { MockGatewayAdapter } from './mock-gateway.adapter';

const TRANSACTION_ID = '0199a7c0-0000-7000-8000-0000000000e1';

describe('MockGatewayAdapter', () => {
  const adapter: MockGatewayAdapter = new MockGatewayAdapter();
  beforeEach(() => {
    process.env['MOCK_GATEWAY_SECRET'] = 'test-secret';
  });
  afterEach(() => {
    delete process.env['MOCK_GATEWAY_SECRET'];
  });
  describe('initiate', () => {
    it.each([
      { inputChannel: 'QR_CODE', expectedType: 'QR_CODE' },
      { inputChannel: 'INTERNATIONAL_CARD', expectedType: 'REDIRECT' },
      { inputChannel: 'DOMESTIC_BANK', expectedType: 'REDIRECT' },
      { inputChannel: 'BANK_TRANSFER', expectedType: 'VIRTUAL_ACCOUNT' },
    ] as const)(
      'should answer $expectedType for $inputChannel',
      async ({ inputChannel, expectedType }) => {
        // Arrange
        // Act
        const actualAction: PaymentClientAction = await adapter.initiate({
          paymentId: 'p1',
          transactionId: TRANSACTION_ID,
          orderId: 'o1',
          amount: 10,
          currency: 'USD',
          channel: inputChannel,
          description: 'Order o1',
        });
        // Assert
        expect(actualAction.type).toBe(expectedType);
      },
    );
  });
  describe('verifyWebhook', () => {
    it('should verify the webhooks it signs', async () => {
      // Arrange
      const inputWebhook: SignedWebhook = adapter.buildSignedWebhook({
        transactionId: TRANSACTION_ID,
        orderId: 'o1',
        amount: 10,
        status: 'SUCCESS',
      });
      // Act
      const actualResult: WebhookResult = await adapter.verifyWebhook(
        inputWebhook.headers,
        Buffer.from(inputWebhook.rawBody),
      );
      // Assert
      expect(actualResult).toEqual({
        isVerified: true,
        transactionId: TRANSACTION_ID,
        gatewayTxId: inputWebhook.gatewayTxId,
        status: 'SUCCESS',
        amount: 10,
        failureReason: undefined,
        rawResponse: JSON.parse(inputWebhook.rawBody),
      });
    });
    it('should report SIGNATURE_MISMATCH with the claimed reference for a tampered body', async () => {
      // Arrange
      const inputWebhook: SignedWebhook = adapter.buildSignedWebhook({
        transactionId: TRANSACTION_ID,
        orderId: 'o1',
        amount: 10,
        status: 'FAILED',
      });
      // Act
      const actualResult: WebhookResult = await adapter.verifyWebhook(
        inputWebhook.headers,
        inputWebhook.rawBody.replace('FAILED', 'SUCCESS'),
      );
      // Assert
      expect(actualResult).toMatchObject({
        isVerified: false,
        reason: 'SIGNATURE_MISMATCH',
        claimedTransactionId: TRANSACTION_ID,
      });
    });
    it('should report MALFORMED_PAYLOAD for a signed body of the wrong shape', async () => {
      // Arrange
      const inputBody: string = JSON.stringify({
        transactionId: TRANSACTION_ID,
      });
      const inputHeaders: Record<string, string> = {
        'x-webhook-signature': adapter['sign'](inputBody),
      };
      // Act
      const actualResult: WebhookResult = await adapter.verifyWebhook(
        inputHeaders,
        inputBody,
      );
      // Assert
      expect(actualResult).toMatchObject({
        isVerified: false,
        reason: 'MALFORMED_PAYLOAD',
        claimedTransactionId: TRANSACTION_ID,
      });
    });
  });
  describe('refund', () => {
    it.each([
      { inputReason: 'Damaged', expectedStatus: 'SUCCESS' },
      { inputReason: 'MOCK_REFUND_DECLINED', expectedStatus: 'FAILED' },
    ])(
      'should answer $expectedStatus for the reason $inputReason',
      async ({ inputReason, expectedStatus }) => {
        // Arrange
        // Act
        const actualResult: RefundGatewayResult = await adapter.refund({
          paymentId: 'p1',
          orderId: 'o1',
          refundTransactionId: 'r1',
          originalTransactionId: TRANSACTION_ID,
          originalGatewayTxId: 'tx-1',
          amount: 4.5,
          currency: 'USD',
          reason: inputReason,
          idempotencyKey: 'k',
        });
        // Assert
        expect(actualResult.status).toBe(expectedStatus);
        expect(actualResult.gatewayTxId).toMatch(/^mock_rf_/);
      },
    );
  });
  it('should report every queried charge as PENDING', async () => {
    // Arrange
    // Act
    const actualResult: WebhookResult = await adapter.queryStatus(
      TRANSACTION_ID,
      'o1',
    );
    // Assert
    expect(actualResult).toMatchObject({ isVerified: true, status: 'PENDING' });
  });
});

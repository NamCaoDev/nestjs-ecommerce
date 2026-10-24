import { GatewayOperationNotSupportedError } from '../../../domain/errors/gateway-operation-not-supported.error';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { computeHmac } from '../shared/compute-hmac.util';
import { buildVnpaySignData } from './build-vnpay-sign-data.util';
import { VnpayGatewayAdapter } from './vnpay-gateway.adapter';

const TRANSACTION_ID = '0199a7c0-0000-7000-8000-0000000000e1';
const HASH_SECRET = 'vnpay-secret';

/**
 * Builds a signed IPN query string with the given response code.
 */
const createIpn = (responseCode: string): string => {
  const params: Record<string, string> = {
    vnp_Amount: '15000000',
    vnp_ResponseCode: responseCode,
    vnp_TmnCode: 'TMN01',
    vnp_TransactionNo: '14012345',
    vnp_TransactionStatus: responseCode,
    vnp_TxnRef: TRANSACTION_ID,
  };
  const signData: string = buildVnpaySignData(params);
  const hash: string = computeHmac({
    algorithm: 'sha512',
    secret: HASH_SECRET,
    payload: signData,
  });
  return `${signData}&vnp_SecureHashType=HmacSHA512&vnp_SecureHash=${hash.toUpperCase()}`;
};

describe('VnpayGatewayAdapter', () => {
  const adapter: VnpayGatewayAdapter = new VnpayGatewayAdapter();
  beforeEach(() => {
    process.env['VNPAY_TMN_CODE'] = 'TMN01';
    process.env['VNPAY_HASH_SECRET'] = HASH_SECRET;
    process.env['VNPAY_RETURN_URL'] = 'https://shop.test/return';
  });
  afterEach(() => {
    delete process.env['VNPAY_TMN_CODE'];
    delete process.env['VNPAY_HASH_SECRET'];
    delete process.env['VNPAY_RETURN_URL'];
  });
  describe('initiate', () => {
    it('should redirect to a signed vnp_Command=pay URL with the amount in VND x 100', async () => {
      // Arrange
      // Act
      const actualAction: PaymentClientAction = await adapter.initiate({
        paymentId: 'p1',
        transactionId: TRANSACTION_ID,
        orderId: 'o1',
        amount: 150000,
        currency: 'VND',
        channel: 'DOMESTIC_BANK',
        description: 'Order o1',
      });
      // Assert
      expect(actualAction.type).toBe('REDIRECT');
      const actualUrl: URL = new URL(
        actualAction.type === 'REDIRECT' ? actualAction.url : '',
      );
      expect(actualUrl.searchParams.get('vnp_Command')).toBe('pay');
      expect(actualUrl.searchParams.get('vnp_Amount')).toBe('15000000');
      expect(actualUrl.searchParams.get('vnp_TxnRef')).toBe(TRANSACTION_ID);
      // The URL signature is accepted; a pay URL is no IPN, so it has no response code.
      const actualResult: WebhookResult = await adapter.verifyWebhook(
        {},
        actualUrl.search,
      );
      expect(actualResult).toMatchObject({
        isVerified: false,
        reason: 'MALFORMED_PAYLOAD',
      });
    });
  });
  describe('verifyWebhook', () => {
    it.each([
      { inputCode: '00', expectedStatus: 'SUCCESS', expectedReason: undefined },
      {
        inputCode: '24',
        expectedStatus: 'CANCELLED',
        expectedReason: 'VNPAY_24',
      },
      { inputCode: '51', expectedStatus: 'FAILED', expectedReason: 'VNPAY_51' },
    ])(
      'should map vnp_ResponseCode $inputCode to $expectedStatus',
      async ({ inputCode, expectedStatus, expectedReason }) => {
        // Arrange
        const inputIpn: string = createIpn(inputCode);
        // Act
        const actualResult: WebhookResult = await adapter.verifyWebhook(
          {},
          inputIpn,
        );
        // Assert
        expect(actualResult).toMatchObject({
          isVerified: true,
          transactionId: TRANSACTION_ID,
          gatewayTxId: '14012345',
          status: expectedStatus,
          amount: 150000,
        });
        expect(
          actualResult.isVerified ? actualResult.failureReason : 'rejected',
        ).toBe(expectedReason);
      },
    );
    it('should report SIGNATURE_MISMATCH for a tampered amount', async () => {
      // Arrange
      const inputIpn: string = createIpn('00').replace(
        'vnp_Amount=15000000',
        'vnp_Amount=100',
      );
      // Act
      const actualResult: WebhookResult = await adapter.verifyWebhook(
        {},
        inputIpn,
      );
      // Assert
      expect(actualResult).toMatchObject({
        isVerified: false,
        reason: 'SIGNATURE_MISMATCH',
        claimedTransactionId: TRANSACTION_ID,
      });
    });
  });
  describe('refund', () => {
    it('should refuse until the merchant web API client is wired', async () => {
      // Arrange
      // Act
      const actualRefund: Promise<unknown> = adapter.refund({
        paymentId: 'p1',
        orderId: 'o1',
        refundTransactionId: '0199a7c0-0000-7000-8000-0000000000e2',
        originalTransactionId: TRANSACTION_ID,
        originalGatewayTxId: '14012345',
        amount: 50000,
        currency: 'VND',
        reason: 'Damaged',
        idempotencyKey: 'k',
      });
      // Assert
      await expect(actualRefund).rejects.toBeInstanceOf(
        GatewayOperationNotSupportedError,
      );
    });
  });
});

import { GatewayOperationNotSupportedError } from '../../../domain/errors/gateway-operation-not-supported.error';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { computeHmac } from '../shared/compute-hmac.util';
import { VietqrVaGatewayAdapter } from './vietqr-va-gateway.adapter';

const TRANSACTION_ID = '0199a7c0-0000-7000-8000-0000000000e1';

describe('VietqrVaGatewayAdapter', () => {
  const adapter: VietqrVaGatewayAdapter = new VietqrVaGatewayAdapter();
  beforeEach(() => {
    process.env['VIETQR_WEBHOOK_SECRET'] = 'vietqr-secret';
  });
  afterEach(() => {
    delete process.env['VIETQR_WEBHOOK_SECRET'];
  });
  it('should issue a virtual account derived from the charge reference', async () => {
    // Arrange
    // Act
    const actualAction: PaymentClientAction = await adapter.initiate({
      paymentId: 'p1',
      transactionId: TRANSACTION_ID,
      orderId: 'o1',
      amount: 150000,
      currency: 'VND',
      channel: 'BANK_TRANSFER',
      description: 'Order o1',
    });
    // Assert
    expect(actualAction).toMatchObject({
      type: 'VIRTUAL_ACCOUNT',
      bankBin: '970422',
      accountName: 'ECOMMERCE',
    });
    expect(
      actualAction.type === 'VIRTUAL_ACCOUNT' ? actualAction.accountNumber : '',
    ).toMatch(/^VQR\d{10}$/);
  });
  it('should verify a signed credit notification', async () => {
    // Arrange
    const inputBody: string = JSON.stringify({
      transactionRef: TRANSACTION_ID,
      bankTxId: 'FT123',
      amount: 150000,
    });
    const inputHeaders: Record<string, string> = {
      'x-vietqr-signature': computeHmac({
        algorithm: 'sha256',
        secret: 'vietqr-secret',
        payload: inputBody,
      }),
    };
    // Act
    const actualResult: WebhookResult = await adapter.verifyWebhook(
      inputHeaders,
      inputBody,
    );
    // Assert
    expect(actualResult).toMatchObject({
      isVerified: true,
      transactionId: TRANSACTION_ID,
      gatewayTxId: 'FT123',
      status: 'SUCCESS',
      amount: 150000,
    });
  });
  it('should report SIGNATURE_MISMATCH for an unsigned notification', async () => {
    // Arrange
    const inputBody: string = JSON.stringify({
      transactionRef: TRANSACTION_ID,
    });
    // Act
    const actualResult: WebhookResult = await adapter.verifyWebhook(
      {},
      inputBody,
    );
    // Assert
    expect(actualResult).toMatchObject({
      isVerified: false,
      reason: 'SIGNATURE_MISMATCH',
      claimedTransactionId: TRANSACTION_ID,
    });
  });
  it('should not support refunds or status queries', async () => {
    // Arrange
    // Act
    const actualRefund: Promise<unknown> = adapter.refund();
    const actualQuery: Promise<unknown> = adapter.queryStatus();
    // Assert
    await expect(actualRefund).rejects.toBeInstanceOf(
      GatewayOperationNotSupportedError,
    );
    await expect(actualQuery).rejects.toBeInstanceOf(
      GatewayOperationNotSupportedError,
    );
  });
});

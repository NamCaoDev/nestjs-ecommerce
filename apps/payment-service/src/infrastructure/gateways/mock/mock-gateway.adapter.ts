import { Injectable } from '@nestjs/common';
import { readEnv } from '@org/shared-infrastructure';
import { randomUUID } from 'node:crypto';
import { BuildSignedWebhookInput } from '../../../application/ports/build-signed-webhook.input';
import { MockGatewaySimulatorPort } from '../../../application/ports/mock-gateway-simulator.port';
import { SignedWebhook } from '../../../application/ports/signed-webhook.type';
import { InitiatePaymentParams } from '../../../domain/ports/initiate-payment-params.type';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import { RefundGatewayParams } from '../../../domain/ports/refund-gateway-params.type';
import { RefundGatewayResult } from '../../../domain/ports/refund-gateway-result.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';
import { computeHmac } from '../shared/compute-hmac.util';
import { isSignatureEqual } from '../shared/is-signature-equal.util';
import { parseJsonObject } from '../shared/parse-json-object.util';
import { toRawBodyText } from '../shared/to-raw-body-text.util';
import { MOCK_GATEWAY } from './mock-gateway.constants';
import { MockWebhookBody } from './mock-webhook-body.type';

/** Final statuses a MOCK webhook may report. */
const FINAL_STATUSES: readonly string[] = ['SUCCESS', 'FAILED', 'CANCELLED'];

/**
 * In-process stand-in for a payment gateway, for development and integration tests. It issues
 * redirect / QR / virtual-account actions, signs and verifies webhooks with HMAC-SHA256 over the raw
 * body (`MOCK_GATEWAY_SECRET`), refunds instantly (reason `MOCK_REFUND_DECLINED` makes it refuse) and
 * plays the gateway side through {@link MockGatewaySimulatorPort}.
 */
@Injectable()
export class MockGatewayAdapter
  implements PaymentGatewayPort, MockGatewaySimulatorPort
{
  public readonly gatewayName: PaymentGatewayProvider = 'MOCK';

  /**
   * @param params - Payment, charge reference, amount and channel.
   * @returns A redirect for cards and bank apps, a VietQR-like code, or a virtual account.
   */
  public initiate(params: InitiatePaymentParams): Promise<PaymentClientAction> {
    const baseUrl: string = readEnv({
      name: MOCK_GATEWAY.BASE_URL_VARIABLE,
      defaultValue: MOCK_GATEWAY.DEFAULT_BASE_URL,
    });
    if (params.channel === 'QR_CODE') {
      return Promise.resolve({
        type: 'QR_CODE',
        qrContent: `MOCKPAY|${params.transactionId}|${params.amount}|${params.currency}`,
        qrImageUrl: `${baseUrl}/qr/${params.transactionId}.png`,
      });
    }
    if (params.channel === 'BANK_TRANSFER') {
      return Promise.resolve({
        type: 'VIRTUAL_ACCOUNT',
        bankBin: '970400',
        accountNumber: `MOCK${params.transactionId.replace(/-/g, '').slice(0, 12)}`,
        accountName: 'MOCK GATEWAY',
        expiresAt: new Date(Date.now() + MOCK_GATEWAY.VIRTUAL_ACCOUNT_TTL_MS),
      });
    }
    return Promise.resolve({
      type: 'REDIRECT',
      url: `${baseUrl}/checkout/${params.transactionId}`,
    });
  }

  /**
   * @param headers - Request headers, lower-cased names.
   * @param rawBody - Raw request body.
   * @returns The verified result, or SIGNATURE_MISMATCH / MALFORMED_PAYLOAD.
   */
  public verifyWebhook(
    headers: Record<string, string>,
    rawBody: unknown,
  ): Promise<WebhookResult> {
    const text: string = toRawBodyText(rawBody);
    const parsed: Record<string, unknown> | undefined = parseJsonObject(text);
    const claimedTransactionId: string | undefined =
      typeof parsed?.['transactionId'] === 'string'
        ? parsed['transactionId']
        : undefined;
    if (
      !isSignatureEqual({
        expected: this.sign(text),
        received: headers[MOCK_GATEWAY.SIGNATURE_HEADER] ?? '',
      })
    ) {
      return Promise.resolve({
        isVerified: false,
        reason: 'SIGNATURE_MISMATCH',
        claimedTransactionId,
        rawResponse: parsed,
      });
    }
    return Promise.resolve(
      MockGatewayAdapter.toResult({ parsed, claimedTransactionId }),
    );
  }

  /**
   * @param params - Charge, amount and refund reference.
   * @returns An instant SUCCESS, or FAILED for the reason `MOCK_REFUND_DECLINED`.
   */
  public refund(params: RefundGatewayParams): Promise<RefundGatewayResult> {
    const gatewayTxId: string = `mock_rf_${randomUUID()}`;
    const isDeclined: boolean =
      params.reason === MOCK_GATEWAY.DECLINED_REFUND_REASON;
    return Promise.resolve({
      status: isDeclined ? 'FAILED' : 'SUCCESS',
      gatewayTxId,
      ...(isDeclined && { failureReason: 'MOCK_REFUND_DECLINED' }),
      rawResponse: {
        refundId: gatewayTxId,
        originalTransaction: params.originalGatewayTxId,
        amount: params.amount,
        currency: params.currency,
        status: isDeclined ? 'DECLINED' : 'REFUNDED',
      },
    });
  }

  /**
   * The mock keeps no state: every queried charge is still PENDING.
   *
   * @param gatewayTxId - Merchant reference of the charge.
   * @param orderId - Order of the charge.
   * @returns A PENDING result.
   */
  public queryStatus(
    gatewayTxId: string,
    orderId: string,
  ): Promise<WebhookResult> {
    return Promise.resolve({
      isVerified: true,
      transactionId: gatewayTxId,
      gatewayTxId,
      status: 'PENDING',
      rawResponse: { orderId, status: 'PENDING' },
    });
  }

  /**
   * @param input - Charge, amount and result.
   * @returns The webhook the mock gateway sends, signed.
   */
  public buildSignedWebhook(input: BuildSignedWebhookInput): SignedWebhook {
    const body: MockWebhookBody = {
      transactionId: input.transactionId,
      orderId: input.orderId,
      gatewayTxId: `mock_tx_${randomUUID()}`,
      status: input.status,
      amount: input.amount,
      ...(input.failureReason !== undefined && {
        failureReason: input.failureReason,
      }),
    };
    const rawBody: string = JSON.stringify(body);
    return {
      headers: {
        'content-type': 'application/json',
        [MOCK_GATEWAY.SIGNATURE_HEADER]: this.sign(rawBody),
      },
      rawBody,
      gatewayTxId: body.gatewayTxId,
    };
  }

  /**
   * @returns hex(HMAC-SHA256(payload, MOCK_GATEWAY_SECRET)).
   */
  private sign(payload: string): string {
    return computeHmac({
      algorithm: MOCK_GATEWAY.HMAC_ALGORITHM,
      secret: readEnv({ name: MOCK_GATEWAY.SECRET_VARIABLE }),
      payload,
    });
  }

  /**
   * Decodes an authentic body, or reports it malformed.
   */
  private static toResult({
    parsed,
    claimedTransactionId,
  }: {
    readonly parsed: Record<string, unknown> | undefined;
    readonly claimedTransactionId: string | undefined;
  }): WebhookResult {
    if (parsed === undefined || !MockGatewayAdapter.isWebhookBody(parsed)) {
      return {
        isVerified: false,
        reason: 'MALFORMED_PAYLOAD',
        claimedTransactionId,
        rawResponse: parsed,
      };
    }
    return {
      isVerified: true,
      transactionId: parsed.transactionId,
      gatewayTxId: parsed.gatewayTxId,
      status: parsed.status,
      amount: parsed.amount,
      failureReason: parsed.failureReason,
      rawResponse: parsed as unknown as Record<string, unknown>,
    };
  }

  /**
   * @returns `true` when the object has the shape of a {@link MockWebhookBody}.
   */
  private static isWebhookBody(
    value: Record<string, unknown>,
  ): value is Record<string, unknown> & MockWebhookBody {
    return (
      typeof value['transactionId'] === 'string' &&
      typeof value['gatewayTxId'] === 'string' &&
      typeof value['amount'] === 'number' &&
      FINAL_STATUSES.includes(String(value['status'])) &&
      (value['failureReason'] === undefined ||
        typeof value['failureReason'] === 'string')
    );
  }
}

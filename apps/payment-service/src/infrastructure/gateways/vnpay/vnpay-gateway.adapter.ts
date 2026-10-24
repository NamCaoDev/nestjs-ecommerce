import { Injectable } from '@nestjs/common';
import { readEnv } from '@org/shared-infrastructure';
import { GatewayOperationNotSupportedError } from '../../../domain/errors/gateway-operation-not-supported.error';
import { InitiatePaymentParams } from '../../../domain/ports/initiate-payment-params.type';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import { RefundGatewayParams } from '../../../domain/ports/refund-gateway-params.type';
import { RefundGatewayResult } from '../../../domain/ports/refund-gateway-result.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';
import { TransactionStatus } from '../../../domain/types/transaction-status.type';
import { computeHmac } from '../shared/compute-hmac.util';
import { isSignatureEqual } from '../shared/is-signature-equal.util';
import { toRawBodyText } from '../shared/to-raw-body-text.util';
import { buildVnpaySignData } from './build-vnpay-sign-data.util';
import { formatVnpayDate } from './format-vnpay-date.util';
import { VNPAY } from './vnpay.constants';

/**
 * Skeleton of the VNPay 2.1.0 adapter. Implemented: the signed payment URL (`vnp_Command=pay`,
 * HMAC-SHA512 over the sorted parameters) and IPN verification (`vnp_ResponseCode` 00 = success,
 * 24 = cancelled by the customer, anything else = failed). Prepared but not wired: the signed refund
 * request (`vnp_Command=refund`; `vnp_TransactionDate` must become the original charge date) and the
 * status query, which need the merchant web API client.
 * Configuration (read on use): `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `VNPAY_PAYMENT_URL`.
 */
@Injectable()
export class VnpayGatewayAdapter implements PaymentGatewayPort {
  public readonly gatewayName: PaymentGatewayProvider = 'VNPAY';

  /**
   * @param params - Payment, charge reference (sent as `vnp_TxnRef`) and amount in VND.
   * @returns A redirect to the signed VNPay payment URL.
   */
  public initiate(params: InitiatePaymentParams): Promise<PaymentClientAction> {
    const now: Date = new Date();
    const signData: string = buildVnpaySignData({
      vnp_Version: VNPAY.VERSION,
      vnp_Command: VNPAY.PAY_COMMAND,
      vnp_TmnCode: readEnv({ name: 'VNPAY_TMN_CODE' }),
      vnp_Amount: String(Math.round(params.amount * VNPAY.AMOUNT_MULTIPLIER)),
      vnp_CurrCode: VNPAY.CURRENCY,
      vnp_TxnRef: params.transactionId,
      vnp_OrderInfo: params.description,
      vnp_OrderType: VNPAY.ORDER_TYPE,
      vnp_Locale: VNPAY.LOCALE,
      vnp_ReturnUrl: readEnv({ name: 'VNPAY_RETURN_URL' }),
      vnp_IpAddr: '127.0.0.1',
      vnp_CreateDate: formatVnpayDate(now),
      vnp_ExpireDate: formatVnpayDate(
        new Date(now.getTime() + VNPAY.EXPIRY_MS),
      ),
    });
    const paymentUrl: string = readEnv({
      name: 'VNPAY_PAYMENT_URL',
      defaultValue: VNPAY.DEFAULT_PAYMENT_URL,
    });
    return Promise.resolve({
      type: 'REDIRECT',
      url: `${paymentUrl}?${signData}&${VNPAY.SECURE_HASH_FIELD}=${this.sign(signData)}`,
    });
  }

  /**
   * Verifies an IPN: the query string (or form body) carries `vnp_SecureHash` over the other `vnp_` fields.
   *
   * @param headers - Request headers (unused: VNPay signs the parameters).
   * @param rawBody - Raw query string / form body, or the parsed parameters.
   * @returns The verified result, or SIGNATURE_MISMATCH / MALFORMED_PAYLOAD.
   */
  public verifyWebhook(
    headers: Record<string, string>,
    rawBody: unknown,
  ): Promise<WebhookResult> {
    const params: Record<string, string> =
      VnpayGatewayAdapter.toParams(rawBody);
    const { [VNPAY.SECURE_HASH_FIELD]: secureHash, ...signed } = params;
    delete signed[VNPAY.SECURE_HASH_TYPE_FIELD];
    const claimedTransactionId: string | undefined = params['vnp_TxnRef'];
    if (
      !isSignatureEqual({
        expected: this.sign(buildVnpaySignData(signed)),
        received: secureHash ?? '',
      })
    ) {
      return Promise.resolve({
        isVerified: false,
        reason: 'SIGNATURE_MISMATCH',
        claimedTransactionId,
        rawResponse: signed,
      });
    }
    return Promise.resolve(VnpayGatewayAdapter.toResult(signed));
  }

  /**
   * Prepares the signed `vnp_Command=refund` request; sending it needs the merchant web API client.
   *
   * @param params - Charge, amount and refund reference.
   * @throws {GatewayOperationNotSupportedError} Until the web API client is wired.
   */
  public refund(params: RefundGatewayParams): Promise<RefundGatewayResult> {
    const request: Readonly<Record<string, string>> =
      this.buildRefundRequest(params);
    return Promise.reject(
      new GatewayOperationNotSupportedError({
        gateway: this.gatewayName,
        operation: `refund ${request['vnp_RequestId']} (merchant web API client not wired)`,
      }),
    );
  }

  /**
   * @param gatewayTxId - VNPay transaction number.
   * @param orderId - Order of the charge.
   * @throws {GatewayOperationNotSupportedError} Until the `querydr` web API client is wired.
   */
  public queryStatus(
    gatewayTxId: string,
    orderId: string,
  ): Promise<WebhookResult> {
    return Promise.reject(
      new GatewayOperationNotSupportedError({
        gateway: this.gatewayName,
        operation: `status query of ${gatewayTxId} for order ${orderId}`,
      }),
    );
  }

  /**
   * Builds the JSON body of `POST /merchant_webapi/api/transaction` for a refund. VNPay signs the
   * fields joined by `|` in this exact order.
   *
   * @returns The request with `vnp_SecureHash`.
   */
  private buildRefundRequest(
    params: RefundGatewayParams,
  ): Readonly<Record<string, string>> {
    const createDate: string = formatVnpayDate(new Date());
    const request: Record<string, string> = {
      vnp_RequestId: params.refundTransactionId.replace(/-/g, ''),
      vnp_Version: VNPAY.VERSION,
      vnp_Command: VNPAY.REFUND_COMMAND,
      vnp_TmnCode: readEnv({ name: 'VNPAY_TMN_CODE' }),
      vnp_TransactionType: VNPAY.PARTIAL_REFUND_TYPE,
      vnp_TxnRef: params.originalTransactionId,
      vnp_Amount: String(Math.round(params.amount * VNPAY.AMOUNT_MULTIPLIER)),
      vnp_TransactionNo: params.originalGatewayTxId,
      vnp_TransactionDate: createDate,
      vnp_CreateBy: 'payment-service',
      vnp_CreateDate: createDate,
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: params.reason,
    };
    return {
      ...request,
      [VNPAY.SECURE_HASH_FIELD]: this.sign(Object.values(request).join('|')),
    };
  }

  /**
   * @returns hex(HMAC-SHA512(data, VNPAY_HASH_SECRET)).
   */
  private sign(data: string): string {
    return computeHmac({
      algorithm: VNPAY.HMAC_ALGORITHM,
      secret: readEnv({ name: 'VNPAY_HASH_SECRET' }),
      payload: data,
    });
  }

  /**
   * @returns The `vnp_` parameters of a query string, form body or object.
   */
  private static toParams(rawBody: unknown): Record<string, string> {
    const entries: [string, string][] =
      typeof rawBody === 'object' &&
      rawBody !== null &&
      !Buffer.isBuffer(rawBody)
        ? Object.entries(rawBody).map(
            ([key, value]: [string, unknown]): [string, string] => [
              key,
              String(value),
            ],
          )
        : [...new URLSearchParams(toRawBodyText(rawBody).replace(/^\?/, ''))];
    return Object.fromEntries(
      entries.filter(([key]: [string, string]): boolean =>
        key.startsWith('vnp_'),
      ),
    );
  }

  /**
   * Maps authentic IPN parameters to a result.
   */
  private static toResult(
    params: Readonly<Record<string, string>>,
  ): WebhookResult {
    const responseCode: string | undefined = params['vnp_ResponseCode'];
    if (params['vnp_TxnRef'] === undefined || responseCode === undefined) {
      return {
        isVerified: false,
        reason: 'MALFORMED_PAYLOAD',
        rawResponse: params,
      };
    }
    const status: TransactionStatus =
      VnpayGatewayAdapter.toStatus(responseCode);
    return {
      isVerified: true,
      transactionId: params['vnp_TxnRef'],
      gatewayTxId: params['vnp_TransactionNo'] ?? params['vnp_TxnRef'],
      status,
      amount: Number(params['vnp_Amount']) / VNPAY.AMOUNT_MULTIPLIER,
      ...(status !== 'SUCCESS' && { failureReason: `VNPAY_${responseCode}` }),
      rawResponse: params,
    };
  }

  /**
   * @returns SUCCESS for 00, CANCELLED for 24, FAILED otherwise.
   */
  private static toStatus(responseCode: string): TransactionStatus {
    if (responseCode === VNPAY.SUCCESS_CODE) {
      return 'SUCCESS';
    }
    return responseCode === VNPAY.CANCELLED_CODE ? 'CANCELLED' : 'FAILED';
  }
}

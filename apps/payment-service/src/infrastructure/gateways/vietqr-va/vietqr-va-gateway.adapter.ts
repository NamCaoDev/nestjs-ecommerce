import { Injectable } from '@nestjs/common';
import { readEnv } from '@org/shared-infrastructure';
import { GatewayOperationNotSupportedError } from '../../../domain/errors/gateway-operation-not-supported.error';
import { InitiatePaymentParams } from '../../../domain/ports/initiate-payment-params.type';
import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import { RefundGatewayResult } from '../../../domain/ports/refund-gateway-result.type';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { PaymentGatewayProvider } from '../../../domain/types/payment-gateway-provider.type';
import { computeHmac } from '../shared/compute-hmac.util';
import { isSignatureEqual } from '../shared/is-signature-equal.util';
import { parseJsonObject } from '../shared/parse-json-object.util';
import { toRawBodyText } from '../shared/to-raw-body-text.util';
import { VIETQR_VA } from './vietqr-va.constants';

/**
 * Skeleton of a VietQR virtual-account adapter (bank transfer to a per-charge account). Implemented:
 * the virtual account issued per charge and the signed credit notification
 * (`{ transactionRef, bankTxId, amount }`, HMAC-SHA256 in `x-vietqr-signature`). Bank transfers are
 * refunded manually and have no status API here, so `refund` and `queryStatus` are not supported.
 * Configuration (read on use): `VIETQR_WEBHOOK_SECRET`, `VIETQR_BANK_BIN`, `VIETQR_ACCOUNT_PREFIX`,
 * `VIETQR_ACCOUNT_NAME`.
 */
@Injectable()
export class VietqrVaGatewayAdapter implements PaymentGatewayPort {
  public readonly gatewayName: PaymentGatewayProvider = 'VIETQR_VA';

  /**
   * @param params - Charge reference and amount.
   * @returns The virtual account to transfer to.
   */
  public initiate(params: InitiatePaymentParams): Promise<PaymentClientAction> {
    const suffix: string = BigInt(`0x${params.transactionId.replace(/-/g, '')}`)
      .toString()
      .slice(-VIETQR_VA.ACCOUNT_SUFFIX_LENGTH);
    return Promise.resolve({
      type: 'VIRTUAL_ACCOUNT',
      bankBin: readEnv({
        name: 'VIETQR_BANK_BIN',
        defaultValue: VIETQR_VA.DEFAULT_BANK_BIN,
      }),
      accountNumber: `${readEnv({ name: 'VIETQR_ACCOUNT_PREFIX', defaultValue: VIETQR_VA.DEFAULT_ACCOUNT_PREFIX })}${suffix}`,
      accountName: readEnv({
        name: 'VIETQR_ACCOUNT_NAME',
        defaultValue: VIETQR_VA.DEFAULT_ACCOUNT_NAME,
      }),
      expiresAt: new Date(Date.now() + VIETQR_VA.EXPIRY_MS),
    });
  }

  /**
   * @param headers - Request headers, lower-cased names.
   * @param rawBody - Raw JSON body.
   * @returns The verified credit, or SIGNATURE_MISMATCH / MALFORMED_PAYLOAD.
   */
  public verifyWebhook(
    headers: Record<string, string>,
    rawBody: unknown,
  ): Promise<WebhookResult> {
    const text: string = toRawBodyText(rawBody);
    const parsed: Record<string, unknown> | undefined = parseJsonObject(text);
    const claimedTransactionId: string | undefined =
      typeof parsed?.['transactionRef'] === 'string'
        ? parsed['transactionRef']
        : undefined;
    const isSigned: boolean = isSignatureEqual({
      expected: computeHmac({
        algorithm: VIETQR_VA.HMAC_ALGORITHM,
        secret: readEnv({ name: 'VIETQR_WEBHOOK_SECRET' }),
        payload: text,
      }),
      received: headers[VIETQR_VA.SIGNATURE_HEADER] ?? '',
    });
    if (
      !isSigned ||
      parsed === undefined ||
      claimedTransactionId === undefined
    ) {
      return Promise.resolve({
        isVerified: false,
        reason: isSigned ? 'MALFORMED_PAYLOAD' : 'SIGNATURE_MISMATCH',
        claimedTransactionId,
        rawResponse: parsed,
      });
    }
    return Promise.resolve({
      isVerified: true,
      transactionId: claimedTransactionId,
      gatewayTxId: String(parsed['bankTxId'] ?? claimedTransactionId),
      status: 'SUCCESS',
      amount: Number(parsed['amount']),
      rawResponse: parsed,
    });
  }

  /**
   * @throws {GatewayOperationNotSupportedError} Bank transfers are refunded manually.
   */
  public refund(): Promise<RefundGatewayResult> {
    return Promise.reject(
      new GatewayOperationNotSupportedError({
        gateway: this.gatewayName,
        operation: 'refund',
      }),
    );
  }

  /**
   * @throws {GatewayOperationNotSupportedError} No status API for virtual accounts.
   */
  public queryStatus(): Promise<WebhookResult> {
    return Promise.reject(
      new GatewayOperationNotSupportedError({
        gateway: this.gatewayName,
        operation: 'status query',
      }),
    );
  }
}

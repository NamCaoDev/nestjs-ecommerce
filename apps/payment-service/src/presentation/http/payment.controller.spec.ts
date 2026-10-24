import { RawBodyRequest } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import type { Request } from 'express';
import { ProcessWebhookCommand } from '../../application/commands/process-webhook/process-webhook.command';
import { RefundPaymentCommand } from '../../application/commands/refund-payment/refund-payment.command';
import { InvalidWebhookSignatureError } from '../../application/errors/invalid-webhook-signature.error';
import { GetPaymentActivitiesQuery } from '../../application/queries/get-payment-activities/get-payment-activities.query';
import { GetPaymentByOrderIdQuery } from '../../application/queries/get-payment-by-order-id/get-payment-by-order-id.query';
import { PaymentNotFoundError } from '../../domain/errors/payment-not-found.error';
import { TEST_IDS } from '../../testing/test-ids';
import { PaymentController } from './payment.controller';
import { WebhookAckResponse } from './webhook-ack.response';

const RAW_BODY = '{"transactionId":"t"}';

/**
 * Builds a request with the given raw body and URL.
 */
const createRequest = ({
  rawBody,
  originalUrl = '/api/payments/webhook/mock',
}: {
  readonly rawBody?: string;
  readonly originalUrl?: string;
}): RawBodyRequest<Request> =>
  ({
    rawBody: rawBody === undefined ? undefined : Buffer.from(rawBody),
    originalUrl,
    headers: { 'x-webhook-signature': 'sig' },
    ip: '203.0.113.7',
    header: (name: string): string | undefined =>
      name === 'x-actor-id' ? 'agent-7' : undefined,
  }) as unknown as RawBodyRequest<Request>;

describe('PaymentController', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockQueryBus: { readonly execute: jest.Mock };
  let controller: PaymentController;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    mockQueryBus = { execute: jest.fn() };
    controller = new PaymentController(
      mockCommandBus as unknown as CommandBus,
      mockQueryBus as unknown as QueryBus,
    );
  });
  describe('receiveWebhook', () => {
    it('should forward gateway, headers, raw body and caller IP', async () => {
      // Arrange
      // Act
      const actualResponse: WebhookAckResponse =
        await controller.receiveWebhook(
          'MOCK',
          createRequest({ rawBody: RAW_BODY }),
        );
      // Assert
      const actualCommand: ProcessWebhookCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(ProcessWebhookCommand);
      expect(actualCommand).toMatchObject({
        gateway: 'MOCK',
        headers: { 'x-webhook-signature': 'sig' },
        rawBody: RAW_BODY,
        ipAddress: '203.0.113.7',
      });
      expect(actualResponse).toEqual({ received: true });
    });
    it('should forward the query string when there is no body (VNPay IPN)', async () => {
      // Arrange
      // Act
      await controller.receiveWebhook(
        'VNPAY',
        createRequest({
          originalUrl:
            '/api/payments/webhook/vnpay?vnp_TxnRef=t&vnp_SecureHash=h',
        }),
      );
      // Assert
      const actualCommand: ProcessWebhookCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand.rawBody).toBe('vnp_TxnRef=t&vnp_SecureHash=h');
    });
    it('should throw the rejection for the global filter', async () => {
      // Arrange
      const expectedError: InvalidWebhookSignatureError =
        new InvalidWebhookSignatureError();
      mockCommandBus.execute.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualCall: Promise<WebhookAckResponse> = controller.receiveWebhook(
        'MOCK',
        createRequest({ rawBody: RAW_BODY }),
      );
      // Assert
      await expect(actualCall).rejects.toBe(expectedError);
    });
  });
  describe('queries', () => {
    it('should read the payment of an order', async () => {
      // Arrange
      const expectedPayment: { orderId: string } = { orderId: TEST_IDS.ORDER };
      mockQueryBus.execute.mockResolvedValue(Result.ok(expectedPayment));
      // Act
      const actualPayment: unknown = await controller.getPaymentByOrderId(
        TEST_IDS.ORDER,
      );
      // Assert
      expect(mockQueryBus.execute.mock.calls[0][0]).toBeInstanceOf(
        GetPaymentByOrderIdQuery,
      );
      expect(actualPayment).toBe(expectedPayment);
    });
    it('should read the activities of a payment', async () => {
      // Arrange
      mockQueryBus.execute.mockResolvedValue(Result.ok([]));
      // Act
      const actualActivities: unknown = await controller.getActivities(
        TEST_IDS.PAYMENT,
      );
      // Assert
      const actualQuery: GetPaymentActivitiesQuery =
        mockQueryBus.execute.mock.calls[0][0];
      expect(actualQuery).toBeInstanceOf(GetPaymentActivitiesQuery);
      expect(actualQuery.paymentId).toBe(TEST_IDS.PAYMENT);
      expect(actualActivities).toEqual([]);
    });
    it('should throw PaymentNotFoundError for the global filter (HTTP 404)', async () => {
      // Arrange
      const expectedError: PaymentNotFoundError = new PaymentNotFoundError('x');
      mockQueryBus.execute.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualCall: Promise<unknown> = controller.getActivities(
        TEST_IDS.PAYMENT,
      );
      // Assert
      await expect(actualCall).rejects.toBe(expectedError);
    });
  });
  describe('refund', () => {
    it('should dispatch RefundPaymentCommand with the key, operator and IP', async () => {
      // Arrange
      const expectedOutput: { status: string } = {
        status: 'PARTIALLY_REFUNDED',
      };
      mockCommandBus.execute.mockResolvedValue(Result.ok(expectedOutput));
      // Act
      const actualOutput: unknown = await controller.refund(
        TEST_IDS.PAYMENT,
        'rf-1',
        { amount: 4.5, reason: 'Damaged' },
        createRequest({}),
      );
      // Assert
      const actualCommand: RefundPaymentCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toMatchObject({
        paymentId: TEST_IDS.PAYMENT,
        amount: 4.5,
        reason: 'Damaged',
        idempotencyKey: 'rf-1',
        actorId: 'agent-7',
        ipAddress: '203.0.113.7',
      });
      expect(actualOutput).toBe(expectedOutput);
    });
  });
  it('should report the service as ok', () => {
    // Arrange
    // Act
    const actualResponse: { service: string } = controller.getSmokeTest();
    // Assert
    expect(actualResponse.service).toBe('payment-service');
  });
});

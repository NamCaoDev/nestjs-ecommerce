import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainError } from '@org/shared-domain';
import { GatewayRefundFailedError } from '../../application/errors/gateway-refund-failed.error';
import { InvalidWebhookSignatureError } from '../../application/errors/invalid-webhook-signature.error';
import { MalformedWebhookError } from '../../application/errors/malformed-webhook.error';
import { DuplicatePaymentError } from '../../domain/errors/duplicate-payment.error';
import { GatewayOperationNotSupportedError } from '../../domain/errors/gateway-operation-not-supported.error';
import { PaymentConcurrencyConflictError } from '../../domain/errors/payment-concurrency-conflict.error';
import { PaymentNotFoundError } from '../../domain/errors/payment-not-found.error';
import { RefundExceedsTotalError } from '../../domain/errors/refund-exceeds-total.error';
import { UnsupportedGatewayError } from '../../domain/errors/unsupported-gateway.error';
import { DomainErrorFilter } from './domain-error.filter';

describe('DomainErrorFilter', () => {
  let mockResponse: { readonly status: jest.Mock; readonly json: jest.Mock };
  let mockHost: ArgumentsHost;
  const filter: DomainErrorFilter = new DomainErrorFilter();
  beforeEach(() => {
    mockResponse = { status: jest.fn(), json: jest.fn() };
    mockResponse.status.mockReturnValue(mockResponse);
    mockHost = {
      switchToHttp: (): { getResponse: () => typeof mockResponse } => ({
        getResponse: (): typeof mockResponse => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });
  it.each([
    {
      inputError: new InvalidWebhookSignatureError(),
      expectedStatus: HttpStatus.UNAUTHORIZED,
    },
    {
      inputError: new PaymentNotFoundError('x'),
      expectedStatus: HttpStatus.NOT_FOUND,
    },
    {
      inputError: new UnsupportedGatewayError('momo'),
      expectedStatus: HttpStatus.NOT_FOUND,
    },
    {
      inputError: new PaymentConcurrencyConflictError('x'),
      expectedStatus: HttpStatus.CONFLICT,
    },
    {
      inputError: new DuplicatePaymentError('x'),
      expectedStatus: HttpStatus.CONFLICT,
    },
    {
      inputError: new GatewayOperationNotSupportedError({
        gateway: 'VNPAY',
        operation: 'refund',
      }),
      expectedStatus: HttpStatus.NOT_IMPLEMENTED,
    },
    {
      inputError: new GatewayRefundFailedError('x'),
      expectedStatus: HttpStatus.BAD_GATEWAY,
    },
    {
      inputError: new MalformedWebhookError(),
      expectedStatus: HttpStatus.BAD_REQUEST,
    },
    {
      inputError: new RefundExceedsTotalError({
        requested: 2,
        refundable: 1,
        currency: 'USD',
      }),
      expectedStatus: HttpStatus.BAD_REQUEST,
    },
  ])(
    'should answer $expectedStatus for $inputError.code',
    ({
      inputError,
      expectedStatus,
    }: {
      inputError: DomainError;
      expectedStatus: HttpStatus;
    }) => {
      // Arrange
      const expectedBody: Record<string, unknown> = {
        statusCode: expectedStatus,
        code: inputError.code,
        message: inputError.message,
      };
      // Act
      filter.catch(inputError, mockHost);
      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
      expect(mockResponse.json).toHaveBeenCalledWith(expectedBody);
    },
  );
});

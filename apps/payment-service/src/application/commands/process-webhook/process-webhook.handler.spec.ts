import { DomainError, Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { AmountMismatchError } from '../../../domain/errors/amount-mismatch.error';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { SavePaymentInput } from '../../../domain/ports/save-payment.input';
import { WebhookResult } from '../../../domain/ports/webhook-result.type';
import { createTestPayment } from '../../../testing/create-test-payment.util';
import { TEST_IDS } from '../../../testing/test-ids';
import { PaymentAuditService } from '../../audit/payment-audit.service';
import { PaymentDomainEventAuditor } from '../../audit/payment-domain-event-auditor';
import { PaymentInitiatedAuditHandler } from '../../audit/payment-initiated.audit-handler';
import { PaymentStatusChangedAuditHandler } from '../../audit/payment-status-changed.audit-handler';
import { PaymentTransactionFinalizedAuditHandler } from '../../audit/payment-transaction-finalized.audit-handler';
import { InvalidWebhookSignatureError } from '../../errors/invalid-webhook-signature.error';
import { MalformedWebhookError } from '../../errors/malformed-webhook.error';
import { PaymentGatewayRegistryPort } from '../../ports/payment-gateway-registry.port';
import { ProcessWebhookCommand } from './process-webhook.command';
import { ProcessWebhookHandler } from './process-webhook.handler';

/** Webhook received in every scenario. */
const INPUT_COMMAND: ProcessWebhookCommand = new ProcessWebhookCommand({
  gateway: 'MOCK',
  headers: { 'user-agent': 'gateway/1', 'x-webhook-signature': 'sig' },
  rawBody: '{"transactionId":"..."}',
  ipAddress: '203.0.113.7',
});

/**
 * Builds a verified result for the test charge.
 */
const createVerifiedResult = (
  overrides: Partial<WebhookResult> = {},
): WebhookResult =>
  ({
    isVerified: true,
    transactionId: TEST_IDS.CHARGE,
    gatewayTxId: 'tx-1',
    status: 'SUCCESS',
    amount: 10,
    rawResponse: { status: 'SUCCESS' },
    ...overrides,
  }) as WebhookResult;

describe('ProcessWebhookHandler', () => {
  let mockAdapter: jest.Mocked<PaymentGatewayPort>;
  let mockRepository: jest.Mocked<PaymentRepositoryPort>;
  let mockAuditService: {
    readonly recordWebhookRejection: jest.Mock;
    readonly recordProtocolEvent: jest.Mock;
  };
  let handler: ProcessWebhookHandler;
  beforeEach(() => {
    mockAdapter = {
      gatewayName: 'MOCK',
      initiate: jest.fn(),
      verifyWebhook: jest.fn().mockResolvedValue(createVerifiedResult()),
      refund: jest.fn(),
      queryStatus: jest.fn(),
    };
    mockRepository = {
      findById: jest.fn(),
      findByOrderId: jest.fn(),
      findByTransactionId: jest.fn().mockResolvedValue(createTestPayment()),
      saveNew: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditService = {
      recordWebhookRejection: jest.fn().mockResolvedValue(undefined),
      recordProtocolEvent: jest.fn().mockResolvedValue(undefined),
    };
    const mockRegistry: jest.Mocked<PaymentGatewayRegistryPort> = {
      get: jest.fn().mockReturnValue(mockAdapter),
      getDefault: jest.fn(),
    };
    handler = new ProcessWebhookHandler(
      mockRepository,
      mockRegistry,
      new PaymentDomainEventAuditor(
        new PaymentInitiatedAuditHandler(),
        new PaymentTransactionFinalizedAuditHandler(),
        new PaymentStatusChangedAuditHandler(),
      ),
      mockAuditService as unknown as PaymentAuditService,
    );
    jest
      .spyOn(handler['logger'], 'log')
      .mockImplementation((): void => undefined);
  });
  describe('execute', () => {
    it('should verify the raw body with the adapter of the gateway', async () => {
      // Arrange
      // Act
      await handler.execute(INPUT_COMMAND);
      // Assert
      expect(mockAdapter.verifyWebhook).toHaveBeenCalledWith(
        INPUT_COMMAND.headers,
        INPUT_COMMAND.rawBody,
      );
    });
    it('should record WEBHOOK_SIGNATURE_MISMATCH and reject a bad signature', async () => {
      // Arrange
      mockAdapter.verifyWebhook.mockResolvedValue({
        isVerified: false,
        reason: 'SIGNATURE_MISMATCH',
        claimedTransactionId: TEST_IDS.CHARGE,
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        InvalidWebhookSignatureError,
      );
      expect(mockAuditService.recordWebhookRejection).toHaveBeenCalledWith({
        gateway: 'MOCK',
        rejection: expect.objectContaining({ reason: 'SIGNATURE_MISMATCH' }),
        ipAddress: '203.0.113.7',
        requestMetadata: { 'user-agent': 'gateway/1' },
      });
      expect(mockRepository.findByTransactionId).not.toHaveBeenCalled();
    });
    it('should reject a malformed payload', async () => {
      // Arrange
      mockAdapter.verifyWebhook.mockResolvedValue({
        isVerified: false,
        reason: 'MALFORMED_PAYLOAD',
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(MalformedWebhookError);
    });
    it('should mark the payment PAID and save ledger, audit rows and events in one call', async () => {
      // Arrange
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      const { payment, auditEntries }: SavePaymentInput =
        mockRepository.save.mock.calls[0][0];
      expect(actualResult.isSuccess).toBe(true);
      expect(payment.status).toBe('PAID');
      expect(payment.domainEvents).toHaveLength(2);
      expect(
        auditEntries.map(({ action, actorType, actorId, ipAddress }) => ({
          action,
          actorType,
          actorId,
          ipAddress,
        })),
      ).toEqual([
        {
          action: 'TRANSACTION_FINALIZED',
          actorType: 'GATEWAY',
          actorId: 'MOCK',
          ipAddress: '203.0.113.7',
        },
        {
          action: 'STATE_CHANGED',
          actorType: 'GATEWAY',
          actorId: 'MOCK',
          ipAddress: '203.0.113.7',
        },
      ]);
    });
    it('should acknowledge a webhook for a charge that is already final without saving', async () => {
      // Arrange
      mockRepository.findByTransactionId.mockResolvedValue(
        createTestPayment({ isPaid: true }),
      );
      mockAdapter.verifyWebhook.mockResolvedValue(
        createVerifiedResult({ status: 'FAILED', gatewayTxId: 'tx-9' }),
      );
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
    it('should ignore a PENDING status', async () => {
      // Arrange
      mockAdapter.verifyWebhook.mockResolvedValue(
        createVerifiedResult({ status: 'PENDING' }),
      );
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockRepository.findByTransactionId).not.toHaveBeenCalled();
    });
    it('should answer PaymentNotFoundError for an unknown charge', async () => {
      // Arrange
      mockRepository.findByTransactionId.mockResolvedValue(undefined);
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(PaymentNotFoundError);
    });
    it('should record WEBHOOK_REJECTED and refuse an authentic result with a wrong amount', async () => {
      // Arrange
      const storedPayment: Payment = createTestPayment();
      mockRepository.findByTransactionId.mockResolvedValue(storedPayment);
      mockAdapter.verifyWebhook.mockResolvedValue(
        createVerifiedResult({ amount: 1 }),
      );
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(INPUT_COMMAND);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(AmountMismatchError);
      expect(mockAuditService.recordProtocolEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: TEST_IDS.PAYMENT,
          action: 'WEBHOOK_REJECTED',
          payload: expect.objectContaining({ code: 'PAYMENT.AMOUNT_MISMATCH' }),
        }),
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});

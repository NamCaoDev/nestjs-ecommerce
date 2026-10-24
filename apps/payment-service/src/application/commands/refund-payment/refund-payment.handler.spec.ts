import { DomainError, Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { InvalidPaymentStateError } from '../../../domain/errors/invalid-payment-state.error';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { RefundExceedsTotalError } from '../../../domain/errors/refund-exceeds-total.error';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { SavePaymentInput } from '../../../domain/ports/save-payment.input';
import { createTestPayment } from '../../../testing/create-test-payment.util';
import { TEST_IDS } from '../../../testing/test-ids';
import { PaymentAuditService } from '../../audit/payment-audit.service';
import { PaymentDomainEventAuditor } from '../../audit/payment-domain-event-auditor';
import { PaymentInitiatedAuditHandler } from '../../audit/payment-initiated.audit-handler';
import { PaymentStatusChangedAuditHandler } from '../../audit/payment-status-changed.audit-handler';
import { PaymentTransactionFinalizedAuditHandler } from '../../audit/payment-transaction-finalized.audit-handler';
import { GatewayRefundFailedError } from '../../errors/gateway-refund-failed.error';
import { PaymentGatewayRegistryPort } from '../../ports/payment-gateway-registry.port';
import { RefundPaymentCommand } from './refund-payment.command';
import { RefundPaymentHandler } from './refund-payment.handler';
import { RefundPaymentOutput } from './refund-payment.output';

/**
 * Builds a refund request of the given amount.
 */
const createCommand = (amount: number): RefundPaymentCommand =>
  new RefundPaymentCommand({
    paymentId: TEST_IDS.PAYMENT,
    amount,
    reason: 'Damaged item',
    idempotencyKey: 'rf-key-1',
    actorId: 'agent-7',
    ipAddress: '10.0.0.9',
  });

describe('RefundPaymentHandler', () => {
  let mockAdapter: jest.Mocked<PaymentGatewayPort>;
  let mockRepository: jest.Mocked<PaymentRepositoryPort>;
  let mockAuditService: { readonly recordProtocolEvent: jest.Mock };
  let handler: RefundPaymentHandler;
  beforeEach(() => {
    mockAdapter = {
      gatewayName: 'MOCK',
      initiate: jest.fn(),
      verifyWebhook: jest.fn(),
      refund: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        gatewayTxId: 'rf-1',
        rawResponse: { refundId: 'rf-1' },
      }),
      queryStatus: jest.fn(),
    };
    mockRepository = {
      findById: jest
        .fn()
        .mockResolvedValue(createTestPayment({ isPaid: true })),
      findByOrderId: jest.fn(),
      findByTransactionId: jest.fn(),
      saveNew: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditService = {
      recordProtocolEvent: jest.fn().mockResolvedValue(undefined),
    };
    const mockRegistry: jest.Mocked<PaymentGatewayRegistryPort> = {
      get: jest.fn().mockReturnValue(mockAdapter),
      getDefault: jest.fn(),
    };
    handler = new RefundPaymentHandler(
      mockRepository,
      mockRegistry,
      new PaymentDomainEventAuditor(
        new PaymentInitiatedAuditHandler(),
        new PaymentTransactionFinalizedAuditHandler(),
        new PaymentStatusChangedAuditHandler(),
      ),
      mockAuditService as unknown as PaymentAuditService,
    );
  });
  describe('execute', () => {
    it('should refund through the gateway of the charge and save a PARTIALLY_REFUNDED payment', async () => {
      // Arrange
      const inputCommand: RefundPaymentCommand = createCommand(4.5);
      // Act
      const actualResult: Result<RefundPaymentOutput, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(mockAdapter.refund).toHaveBeenCalledWith(
        expect.objectContaining({
          originalTransactionId: TEST_IDS.CHARGE,
          originalGatewayTxId: 'tx-1',
          amount: 4.5,
          currency: 'USD',
          idempotencyKey: `refund:${TEST_IDS.PAYMENT}:rf-key-1`,
        }),
      );
      const { payment, auditEntries }: SavePaymentInput =
        mockRepository.save.mock.calls[0][0];
      expect(payment.totalAmount.amount).toBe(10);
      expect(payment.refundedAmount.amount).toBe(4.5);
      expect(payment.status).toBe('PARTIALLY_REFUNDED');
      expect(auditEntries).toEqual([
        expect.objectContaining({
          action: 'TRANSACTION_FINALIZED',
          actorType: 'ADMIN',
          actorId: 'agent-7',
        }),
        expect.objectContaining({
          action: 'STATE_CHANGED',
          stateFrom: 'PAID',
          stateTo: 'PARTIALLY_REFUNDED',
        }),
      ]);
      expect(actualResult.getValue()).toMatchObject({
        paymentId: TEST_IDS.PAYMENT,
        status: 'PARTIALLY_REFUNDED',
        totalAmount: 10,
        refundedAmount: 4.5,
      });
    });
    it('should return the recorded refund for a replayed Idempotency-Key without calling the gateway', async () => {
      // Arrange
      const storedPayment: Payment = createTestPayment({ isPaid: true });
      storedPayment.applyRefund({
        transactionId: '0199a7c0-0000-7000-8000-0000000000e2',
        amount: storedPayment.totalAmount,
        gatewayTxId: 'rf-0',
        gateway: 'MOCK',
        channel: 'QR_CODE',
        idempotencyKey: `refund:${TEST_IDS.PAYMENT}:rf-key-1`,
      });
      mockRepository.findById.mockResolvedValue(storedPayment);
      // Act
      const actualResult: Result<RefundPaymentOutput, DomainError> =
        await handler.execute(createCommand(4.5));
      // Assert
      expect(actualResult.getValue()).toMatchObject({
        refundTransactionId: '0199a7c0-0000-7000-8000-0000000000e2',
        status: 'REFUNDED',
      });
      expect(mockAdapter.refund).not.toHaveBeenCalled();
    });
    it.each([
      {
        description: 'above the total',
        inputAmount: 10.5,
        inputPayment: (): Payment => createTestPayment({ isPaid: true }),
        expectedErrorType: RefundExceedsTotalError,
      },
      {
        description: 'of an unpaid payment',
        inputAmount: 1,
        inputPayment: (): Payment => createTestPayment(),
        expectedErrorType: InvalidPaymentStateError,
      },
    ])(
      'should refuse a refund $description before calling the gateway',
      async ({ inputAmount, inputPayment, expectedErrorType }) => {
        // Arrange
        mockRepository.findById.mockResolvedValue(inputPayment());
        // Act
        const actualResult: Result<RefundPaymentOutput, DomainError> =
          await handler.execute(createCommand(inputAmount));
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
        expect(mockAdapter.refund).not.toHaveBeenCalled();
      },
    );
    it('should record REFUND_REJECTED_BY_GATEWAY when the gateway refuses', async () => {
      // Arrange
      mockAdapter.refund.mockResolvedValue({
        status: 'FAILED',
        gatewayTxId: 'rf-x',
        failureReason: 'INSUFFICIENT_BALANCE',
        rawResponse: {},
      });
      // Act
      const actualResult: Result<RefundPaymentOutput, DomainError> =
        await handler.execute(createCommand(4.5));
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(GatewayRefundFailedError);
      expect(mockAuditService.recordProtocolEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_REJECTED_BY_GATEWAY' }),
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
    it('should fail for an unknown payment', async () => {
      // Arrange
      mockRepository.findById.mockResolvedValue(undefined);
      // Act
      const actualResult: Result<RefundPaymentOutput, DomainError> =
        await handler.execute(createCommand(1));
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(PaymentNotFoundError);
    });
  });
});

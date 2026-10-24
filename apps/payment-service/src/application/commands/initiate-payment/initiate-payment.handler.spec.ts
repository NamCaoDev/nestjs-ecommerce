import { DomainError, Result } from '@org/shared-domain';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { DuplicatePaymentError } from '../../../domain/errors/duplicate-payment.error';
import { InvalidIdentifierError } from '../../../domain/errors/invalid-identifier.error';
import { InvalidMoneyError } from '../../../domain/errors/invalid-money.error';
import { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '../../../domain/ports/payment-repository.port';
import { SavePaymentInput } from '../../../domain/ports/save-payment.input';
import { createTestPayment } from '../../../testing/create-test-payment.util';
import { TEST_IDS } from '../../../testing/test-ids';
import { PaymentDomainEventAuditor } from '../../audit/payment-domain-event-auditor';
import { PaymentInitiatedAuditHandler } from '../../audit/payment-initiated.audit-handler';
import { PaymentStatusChangedAuditHandler } from '../../audit/payment-status-changed.audit-handler';
import { PaymentTransactionFinalizedAuditHandler } from '../../audit/payment-transaction-finalized.audit-handler';
import { PaymentGatewayRegistryPort } from '../../ports/payment-gateway-registry.port';
import { InitiatePaymentCommandProps } from './initiate-payment-command.props';
import { InitiatePaymentCommand } from './initiate-payment.command';
import { InitiatePaymentHandler } from './initiate-payment.handler';
import { InitiatePaymentOutput } from './initiate-payment.output';

const VALID_PROPS: InitiatePaymentCommandProps = {
  orderId: TEST_IDS.ORDER,
  customerId: TEST_IDS.CUSTOMER,
  amount: 39.98,
  currency: 'USD',
  items: [{ skuId: TEST_IDS.SKU, quantity: 2 }],
  idempotencyKey: 'event-1',
};

describe('InitiatePaymentHandler', () => {
  let mockRepository: jest.Mocked<PaymentRepositoryPort>;
  let mockGateway: jest.Mocked<PaymentGatewayPort>;
  let mockRegistry: jest.Mocked<PaymentGatewayRegistryPort>;
  let handler: InitiatePaymentHandler;
  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      findByOrderId: jest.fn().mockResolvedValue(undefined),
      findByTransactionId: jest.fn(),
      saveNew: jest.fn().mockResolvedValue(Result.ok()),
      save: jest.fn(),
    };
    mockGateway = {
      gatewayName: 'MOCK',
      initiate: jest
        .fn()
        .mockResolvedValue({ type: 'REDIRECT', url: 'https://pay/1' }),
      verifyWebhook: jest.fn(),
      refund: jest.fn(),
      queryStatus: jest.fn(),
    };
    mockRegistry = {
      get: jest.fn(),
      getDefault: jest.fn().mockReturnValue({
        gateway: mockGateway,
        channel: 'INTERNATIONAL_CARD',
      }),
    };
    handler = new InitiatePaymentHandler(
      mockRepository,
      mockRegistry,
      new PaymentDomainEventAuditor(
        new PaymentInitiatedAuditHandler(),
        new PaymentTransactionFinalizedAuditHandler(),
        new PaymentStatusChangedAuditHandler(),
      ),
    );
  });
  describe('execute', () => {
    it('should open a PENDING charge at the default gateway and save it with its audit row', async () => {
      // Arrange
      const inputCommand: InitiatePaymentCommand = new InitiatePaymentCommand(
        VALID_PROPS,
      );
      // Act
      const actualResult: Result<InitiatePaymentOutput, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      const { payment, auditEntries }: SavePaymentInput =
        mockRepository.saveNew.mock.calls[0][0];
      const actualCharge = payment.transactions[0];
      expect(mockGateway.initiate).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: payment.id.value,
          transactionId: actualCharge.id,
          amount: 39.98,
          currency: 'USD',
          channel: 'INTERNATIONAL_CARD',
        }),
      );
      expect(payment.status).toBe('PENDING');
      expect(payment.totalAmount.amount).toBe(39.98);
      expect(actualCharge).toMatchObject({
        type: 'CHARGE',
        status: 'PENDING',
        gateway: 'MOCK',
        channel: 'INTERNATIONAL_CARD',
        idempotencyKey: 'charge:event-1',
        rawGatewayResponse: {
          clientAction: { type: 'REDIRECT', url: 'https://pay/1' },
        },
      });
      expect(auditEntries).toEqual([
        expect.objectContaining({
          action: 'PAYMENT_INITIATED',
          actorType: 'SYSTEM',
          transactionId: actualCharge.id,
        }),
      ]);
      expect(actualResult.getValue()).toEqual({
        paymentId: payment.id.value,
        transactionId: actualCharge.id,
        clientAction: { type: 'REDIRECT', url: 'https://pay/1' },
      });
    });
    it('should return the existing payment of the order without calling the gateway', async () => {
      // Arrange
      mockRepository.findByOrderId.mockResolvedValue(createTestPayment());
      // Act
      const actualResult: Result<InitiatePaymentOutput, DomainError> =
        await handler.execute(new InitiatePaymentCommand(VALID_PROPS));
      // Assert
      expect(actualResult.getValue()).toEqual({
        paymentId: TEST_IDS.PAYMENT,
        transactionId: TEST_IDS.CHARGE,
      });
      expect(mockGateway.initiate).not.toHaveBeenCalled();
      expect(mockRepository.saveNew).not.toHaveBeenCalled();
    });
    it('should return the payment stored by a concurrent run on a duplicate insert', async () => {
      // Arrange
      const concurrentPayment: Payment = createTestPayment();
      mockRepository.saveNew.mockResolvedValue(
        Result.fail(new DuplicatePaymentError(TEST_IDS.ORDER)),
      );
      mockRepository.findByOrderId
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(concurrentPayment);
      // Act
      const actualResult: Result<InitiatePaymentOutput, DomainError> =
        await handler.execute(new InitiatePaymentCommand(VALID_PROPS));
      // Assert
      expect(actualResult.getValue().paymentId).toBe(TEST_IDS.PAYMENT);
    });
    it.each([
      {
        inputProps: { ...VALID_PROPS, orderId: 'order-1' },
        expectedErrorType: InvalidIdentifierError,
      },
      {
        inputProps: { ...VALID_PROPS, currency: 'undefined' },
        expectedErrorType: InvalidMoneyError,
      },
      {
        inputProps: { ...VALID_PROPS, amount: 0 },
        expectedErrorType: InvalidMoneyError,
      },
    ])(
      'should refuse invalid order data with $expectedErrorType.name',
      async ({ inputProps, expectedErrorType }) => {
        // Arrange
        const inputCommand: InitiatePaymentCommand = new InitiatePaymentCommand(
          inputProps,
        );
        // Act
        const actualResult: Result<InitiatePaymentOutput, DomainError> =
          await handler.execute(inputCommand);
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
        expect(mockGateway.initiate).not.toHaveBeenCalled();
      },
    );
  });
});

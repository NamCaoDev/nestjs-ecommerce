import { AuditLogPort } from '../ports/audit-log.port';
import { PaymentReadPort } from '../ports/payment-read.port';
import { PaymentAuditService } from './payment-audit.service';

const PAYMENT_ID = '0199a7c0-0000-7000-8000-0000000000f1';
const TRANSACTION_ID = '0199a7c0-0000-7000-8000-0000000000e1';

describe('PaymentAuditService', () => {
  let mockAuditLog: jest.Mocked<AuditLogPort>;
  let mockRead: jest.Mocked<PaymentReadPort>;
  let service: PaymentAuditService;
  beforeEach(() => {
    mockAuditLog = { append: jest.fn().mockResolvedValue(undefined) };
    mockRead = {
      findByOrderId: jest.fn(),
      findActivities: jest.fn(),
      findPaymentIdByTransactionId: jest.fn().mockResolvedValue(PAYMENT_ID),
    };
    service = new PaymentAuditService(mockAuditLog, mockRead);
    jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation((): void => undefined);
  });
  describe('recordWebhookRejection', () => {
    it('should append WEBHOOK_SIGNATURE_MISMATCH to the claimed payment with IP and masked payload', async () => {
      // Arrange
      // Act
      await service.recordWebhookRejection({
        gateway: 'MOCK',
        rejection: {
          isVerified: false,
          reason: 'SIGNATURE_MISMATCH',
          claimedTransactionId: TRANSACTION_ID,
          rawResponse: { transactionId: TRANSACTION_ID, signature: 'forged' },
        },
        ipAddress: '203.0.113.7',
        requestMetadata: { 'user-agent': 'curl/8' },
      });
      // Assert
      expect(mockAuditLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: PAYMENT_ID,
          transactionId: TRANSACTION_ID,
          action: 'WEBHOOK_SIGNATURE_MISMATCH',
          actorType: 'GATEWAY',
          actorId: 'MOCK',
          ipAddress: '203.0.113.7',
          payload: {
            reason: 'SIGNATURE_MISMATCH',
            claimedPayload: { transactionId: TRANSACTION_ID, signature: '***' },
            request: { 'user-agent': 'curl/8' },
          },
        }),
      );
    });
    it('should record a malformed payload as WEBHOOK_PAYLOAD_MALFORMED', async () => {
      // Arrange
      // Act
      await service.recordWebhookRejection({
        gateway: 'VNPAY',
        rejection: {
          isVerified: false,
          reason: 'MALFORMED_PAYLOAD',
          claimedTransactionId: TRANSACTION_ID,
        },
      });
      // Assert
      expect(mockAuditLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WEBHOOK_PAYLOAD_MALFORMED' }),
      );
    });
    it.each([
      { description: 'no reference', inputReference: undefined },
      { description: 'a reference that is not a UUID', inputReference: 'x' },
    ])(
      'should only log a rejection with $description',
      async ({ inputReference }) => {
        // Arrange
        // Act
        await service.recordWebhookRejection({
          gateway: 'MOCK',
          rejection: {
            isVerified: false,
            reason: 'SIGNATURE_MISMATCH',
            claimedTransactionId: inputReference,
          },
        });
        // Assert
        expect(mockRead.findPaymentIdByTransactionId).not.toHaveBeenCalled();
        expect(mockAuditLog.append).not.toHaveBeenCalled();
        expect(service['logger'].warn).toHaveBeenCalled();
      },
    );
    it('should only log a rejection whose reference matches no payment', async () => {
      // Arrange
      mockRead.findPaymentIdByTransactionId.mockResolvedValue(undefined);
      // Act
      await service.recordWebhookRejection({
        gateway: 'MOCK',
        rejection: {
          isVerified: false,
          reason: 'SIGNATURE_MISMATCH',
          claimedTransactionId: TRANSACTION_ID,
        },
      });
      // Assert
      expect(mockAuditLog.append).not.toHaveBeenCalled();
    });
  });
});

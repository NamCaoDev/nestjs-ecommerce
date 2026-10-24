import { DomainError, Result } from '@org/shared-domain';
import { InvalidGatewayResultError } from '../errors/invalid-gateway-result.error';
import { InvalidTransactionError } from '../errors/invalid-transaction.error';
import { TransactionAlreadyFinalizedError } from '../errors/transaction-already-finalized.error';
import { Money } from '../value-objects/money.vo';
import { CreateTransactionInput } from './create-transaction.input';
import { PaymentTransaction } from './payment-transaction.entity';

const TRANSACTION_ID = '0199a7c0-0000-7000-8000-0000000000e1';
const VALID_INPUT: CreateTransactionInput = {
  id: TRANSACTION_ID,
  gateway: 'MOCK',
  channel: 'QR_CODE',
  amount: Money.create({ amount: 10, currency: 'USD' }).getValue(),
  idempotencyKey: 'charge:event-1',
};

/**
 * Opens a valid PENDING charge.
 */
const createPendingCharge = (): PaymentTransaction =>
  PaymentTransaction.createPendingCharge(VALID_INPUT).getValue();

describe('PaymentTransaction', () => {
  describe('createPendingCharge', () => {
    it('should open a PENDING CHARGE without gateway id', () => {
      // Arrange
      // Act
      const actualCharge: PaymentTransaction = createPendingCharge();
      // Assert
      expect(actualCharge).toMatchObject({
        id: TRANSACTION_ID,
        type: 'CHARGE',
        status: 'PENDING',
        gatewayTxId: undefined,
      });
      expect(actualCharge.isFinal()).toBe(false);
    });
    it.each([
      { inputInput: { ...VALID_INPUT, id: 'tx-1' } },
      { inputInput: { ...VALID_INPUT, amount: Money.zero('USD') } },
      { inputInput: { ...VALID_INPUT, idempotencyKey: ' ' } },
    ])('should refuse invalid input', ({ inputInput }) => {
      // Arrange
      // Act
      const actualResult: Result<PaymentTransaction, DomainError> =
        PaymentTransaction.createPendingCharge(inputInput);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidTransactionError);
    });
  });
  describe('createSucceededRefund', () => {
    it('should record a SUCCESS REFUND with its gateway id', () => {
      // Arrange
      // Act
      const actualRefund: PaymentTransaction =
        PaymentTransaction.createSucceededRefund({
          ...VALID_INPUT,
          gatewayTxId: 'rf-1',
        }).getValue();
      // Assert
      expect(actualRefund).toMatchObject({
        type: 'REFUND',
        status: 'SUCCESS',
        gatewayTxId: 'rf-1',
      });
      expect(actualRefund.isFinal()).toBe(true);
    });
    it('should refuse a refund without gateway id', () => {
      // Arrange
      // Act
      const actualResult: Result<PaymentTransaction, DomainError> =
        PaymentTransaction.createSucceededRefund({
          ...VALID_INPUT,
          gatewayTxId: '',
        });
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidGatewayResultError);
    });
  });
  describe('finalize', () => {
    it('should record the gateway result of a PENDING charge', () => {
      // Arrange
      const charge: PaymentTransaction = createPendingCharge();
      // Act
      charge.finalize({
        status: 'FAILED',
        gatewayTxId: 'tx-1',
        rawResponse: { code: '51' },
        failureReason: 'INSUFFICIENT_FUNDS',
      });
      // Assert
      expect(charge).toMatchObject({
        status: 'FAILED',
        gatewayTxId: 'tx-1',
        failureReason: 'INSUFFICIENT_FUNDS',
        rawGatewayResponse: { code: '51' },
      });
    });
    it('should default the reason of a CANCELLED result', () => {
      // Arrange
      const charge: PaymentTransaction = createPendingCharge();
      // Act
      charge.finalize({ status: 'CANCELLED', gatewayTxId: 'tx-1' });
      // Assert
      expect(charge.failureReason).toBe('CANCELLED');
    });
    it.each(['SUCCESS', 'FAILED', 'CANCELLED'] as const)(
      'should throw a DomainError when a %s entry is finalised again',
      (inputStatus: 'SUCCESS' | 'FAILED' | 'CANCELLED') => {
        // Arrange
        const charge: PaymentTransaction = createPendingCharge();
        charge.finalize({ status: inputStatus, gatewayTxId: 'tx-1' });
        // Act
        const actualError: unknown = ((): unknown => {
          try {
            charge.finalize({ status: 'SUCCESS', gatewayTxId: 'tx-2' });
            return undefined;
          } catch (err: unknown) {
            return err;
          }
        })();
        // Assert
        expect(actualError).toBeInstanceOf(TransactionAlreadyFinalizedError);
        expect(actualError).toBeInstanceOf(DomainError);
        expect(charge.status).toBe(inputStatus);
        expect(charge.gatewayTxId).toBe('tx-1');
      },
    );
    it('should throw for a blank gateway transaction id', () => {
      // Arrange
      const charge: PaymentTransaction = createPendingCharge();
      // Act
      const actualFinalize: () => void = () =>
        charge.finalize({ status: 'SUCCESS', gatewayTxId: ' ' });
      // Assert
      expect(actualFinalize).toThrow(InvalidGatewayResultError);
      expect(charge.status).toBe('PENDING');
    });
  });
});

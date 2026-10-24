import { PaymentStatus } from '../types/payment-status.type';
import { canTransitionPaymentStatus } from './can-transition-payment-status.util';

const STATUSES: readonly PaymentStatus[] = [
  'PENDING',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
];

/** Every allowed move; every other pair of statuses is forbidden. */
const ALLOWED: ReadonlySet<string> = new Set([
  'PENDING→PAID',
  'PENDING→FAILED',
  'PAID→PARTIALLY_REFUNDED',
  'PAID→REFUNDED',
  'PARTIALLY_REFUNDED→PARTIALLY_REFUNDED',
  'PARTIALLY_REFUNDED→REFUNDED',
]);

describe('canTransitionPaymentStatus', () => {
  it.each(
    STATUSES.flatMap((from: PaymentStatus) =>
      STATUSES.map((to: PaymentStatus) => ({
        from,
        to,
        expectedIsAllowed: ALLOWED.has(`${from}→${to}`),
      })),
    ),
  )(
    'should answer $expectedIsAllowed for $from → $to',
    ({ from, to, expectedIsAllowed }) => {
      // Arrange
      // Act
      const actualIsAllowed: boolean = canTransitionPaymentStatus({ from, to });
      // Assert
      expect(actualIsAllowed).toBe(expectedIsAllowed);
    },
  );
});

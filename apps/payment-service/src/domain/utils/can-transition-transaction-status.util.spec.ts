import { TransactionStatus } from '../types/transaction-status.type';
import { canTransitionTransactionStatus } from './can-transition-transaction-status.util';

const STATUSES: readonly TransactionStatus[] = [
  'PENDING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
];

/** Every allowed move; every other pair of statuses is forbidden. */
const ALLOWED: ReadonlySet<string> = new Set([
  'PENDING→SUCCESS',
  'PENDING→FAILED',
  'PENDING→CANCELLED',
]);

describe('canTransitionTransactionStatus', () => {
  it.each(
    STATUSES.flatMap((from: TransactionStatus) =>
      STATUSES.map((to: TransactionStatus) => ({
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
      const actualIsAllowed: boolean = canTransitionTransactionStatus({
        from,
        to,
      });
      // Assert
      expect(actualIsAllowed).toBe(expectedIsAllowed);
    },
  );
});

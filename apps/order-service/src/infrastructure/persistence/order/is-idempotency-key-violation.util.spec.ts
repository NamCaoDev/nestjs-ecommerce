import { Prisma } from '../prisma/generated/client';
import { isIdempotencyKeyViolation } from './is-idempotency-key-violation.util';

/**
 * Builds a Prisma known request error with the given code and metadata.
 */
const createMockPrismaError = ({
  code,
  meta,
}: {
  readonly code: string;
  readonly meta: Record<string, unknown>;
}): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: '7.10.1',
    meta,
  });

describe('isIdempotencyKeyViolation', () => {
  it.each([
    {
      scenario: 'the pg driver adapter reports the idempotency index',
      inputError: createMockPrismaError({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: 'orders_customer_id_idempotency_key_key' },
            },
          },
        },
      }),
      expectedResult: true,
    },
    {
      scenario: 'the classic engine reports the idempotency column as target',
      inputError: createMockPrismaError({
        code: 'P2002',
        meta: { target: ['idempotency_key'] },
      }),
      expectedResult: true,
    },
    {
      scenario: 'another unique index is violated',
      inputError: createMockPrismaError({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'orders_pkey' } },
          },
        },
      }),
      expectedResult: false,
    },
    {
      scenario: 'the Prisma error is not a unique violation',
      inputError: createMockPrismaError({ code: 'P2025', meta: {} }),
      expectedResult: false,
    },
    {
      scenario: 'the error is not a Prisma error',
      inputError: new Error('P2002 orders_idempotency_key_key'),
      expectedResult: false,
    },
  ])(
    'should return $expectedResult when $scenario',
    ({ inputError, expectedResult }) => {
      // Arrange
      const expectedValue: boolean = expectedResult;
      // Act
      const actualResult: boolean = isIdempotencyKeyViolation(inputError);
      // Assert
      expect(actualResult).toBe(expectedValue);
    },
  );
});

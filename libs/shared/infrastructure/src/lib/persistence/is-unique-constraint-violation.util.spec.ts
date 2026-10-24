import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { isUniqueConstraintViolation } from './is-unique-constraint-violation.util';

const INDEX_NAME = 'orders_customer_id_idempotency_key_key';
const COLUMN_NAME = 'idempotency_key';

/**
 * Builds a Prisma known request error with the given code and metadata.
 */
const createMockPrismaError = ({
  code,
  meta,
}: {
  readonly code: string;
  readonly meta: Record<string, unknown>;
}): PrismaClientKnownRequestError =>
  new PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: '7.10.1',
    meta,
  });

describe('isUniqueConstraintViolation', () => {
  it.each([
    {
      scenario: 'the pg driver adapter reports the index',
      inputError: createMockPrismaError({
        code: 'P2002',
        meta: {
          driverAdapterError: { cause: { constraint: { index: INDEX_NAME } } },
        },
      }),
      expectedResult: true,
    },
    {
      scenario: 'the classic engine reports the column as target',
      inputError: createMockPrismaError({
        code: 'P2002',
        meta: { target: [COLUMN_NAME] },
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
      inputError: new Error(`P2002 ${INDEX_NAME}`),
      expectedResult: false,
    },
  ])(
    'should return $expectedResult when $scenario',
    ({ inputError, expectedResult }) => {
      // Arrange
      const expectedValue: boolean = expectedResult;
      // Act
      const actualResult: boolean = isUniqueConstraintViolation({
        error: inputError,
        indexName: INDEX_NAME,
        columnName: COLUMN_NAME,
      });
      // Assert
      expect(actualResult).toBe(expectedValue);
    },
  );
});

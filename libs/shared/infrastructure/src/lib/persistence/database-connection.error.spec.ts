import { DatabaseConnectionError } from './database-connection.error';

describe('DatabaseConnectionError', () => {
  it.each([
    {
      inputCause: new Error('password authentication failed'),
      expectedDetail: 'password authentication failed',
    },
    {
      inputCause: Object.assign(new AggregateError([], ''), {
        code: 'ECONNREFUSED',
      }),
      expectedDetail: 'ECONNREFUSED',
    },
    {
      inputCause: Object.assign(
        new Error('\nInvalid `prisma.$executeRawUnsafe()` invocation:\n\n\n'),
        {
          code: 'ECONNREFUSED',
        },
      ),
      expectedDetail:
        'ECONNREFUSED: Invalid `prisma.$executeRawUnsafe()` invocation:',
    },
    { inputCause: 'socket hang up', expectedDetail: 'socket hang up' },
  ])(
    'should describe the cause as "$expectedDetail"',
    ({ inputCause, expectedDetail }) => {
      // Arrange
      const expectedMessage: string = `order-service cannot reach its database: ${expectedDetail}`;
      // Act
      const actualError: DatabaseConnectionError = new DatabaseConnectionError({
        serviceName: 'order-service',
        cause: inputCause,
      });
      // Assert
      expect(actualError.message).toBe(expectedMessage);
      expect(actualError.cause).toBe(inputCause);
    },
  );
});

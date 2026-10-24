import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainError } from '@org/shared-domain';
import { DuplicateRequestError } from '../../application/errors/duplicate-request.error';
import { StockReservationFailedError } from '../../application/errors/stock-reservation-failed.error';
import { EmptyOrderError } from '../../domain/errors/empty-order.error';
import { DomainErrorFilter } from './domain-error.filter';

describe('DomainErrorFilter', () => {
  let mockResponse: { readonly status: jest.Mock; readonly json: jest.Mock };
  let mockHost: ArgumentsHost;
  const filter: DomainErrorFilter = new DomainErrorFilter();
  beforeEach(() => {
    mockResponse = { status: jest.fn(), json: jest.fn() };
    mockResponse.status.mockReturnValue(mockResponse);
    mockHost = {
      switchToHttp: (): { getResponse: () => typeof mockResponse } => ({
        getResponse: (): typeof mockResponse => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });
  describe('catch', () => {
    it.each([
      {
        inputError: new DuplicateRequestError('checkout-42'),
        expectedStatus: HttpStatus.CONFLICT,
      },
      {
        inputError: new StockReservationFailedError(),
        expectedStatus: HttpStatus.BAD_REQUEST,
      },
      {
        inputError: new EmptyOrderError(),
        expectedStatus: HttpStatus.BAD_REQUEST,
      },
    ])(
      'should answer $expectedStatus for $inputError.code',
      ({
        inputError,
        expectedStatus,
      }: {
        inputError: DomainError;
        expectedStatus: HttpStatus;
      }) => {
        // Arrange
        const expectedBody: Record<string, unknown> = {
          statusCode: expectedStatus,
          code: inputError.code,
          message: inputError.message,
        };
        // Act
        filter.catch(inputError, mockHost);
        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
        expect(mockResponse.json).toHaveBeenCalledWith(expectedBody);
      },
    );
  });
});

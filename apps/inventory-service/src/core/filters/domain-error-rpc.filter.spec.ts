import { status as GrpcStatus } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import { InvalidReservationError } from '../../domain/errors/invalid-reservation.error';
import { DomainErrorRpcFilter } from './domain-error-rpc.filter';

describe('DomainErrorRpcFilter', () => {
  describe('catch', () => {
    it('should fail the call with INVALID_ARGUMENT and the domain error code', async () => {
      // Arrange
      const inputError: InvalidReservationError = new InvalidReservationError(
        'no items',
      );
      const filter: DomainErrorRpcFilter = new DomainErrorRpcFilter();
      // Act
      const actualCall: Promise<never> = firstValueFrom(
        filter.catch(inputError),
      );
      // Assert
      await expect(actualCall).rejects.toEqual({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'INVENTORY.INVALID_RESERVATION: Invalid reservation: no items',
      });
    });
  });
});

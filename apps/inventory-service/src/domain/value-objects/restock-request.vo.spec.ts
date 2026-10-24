import { Result } from '@org/shared-domain';
import { InvalidRestockError } from '../errors/invalid-restock.error';
import { RestockRequestProps } from './restock-request.props';
import { RestockRequest } from './restock-request.vo';

const VALID_PROPS: RestockRequestProps = {
  skuId: '0199a7c0-0000-7000-8000-000000000101',
  quantity: 50,
  referenceNote: 'PO-2026-0042',
};

describe('RestockRequest', () => {
  it('should expose the SKU, quantity and note', () => {
    // Arrange
    const inputProps: RestockRequestProps = VALID_PROPS;
    // Act
    const actualRequest: RestockRequest =
      RestockRequest.create(inputProps).getValue();
    // Assert
    expect(actualRequest.skuId).toBe(VALID_PROPS.skuId);
    expect(actualRequest.quantity).toBe(50);
    expect(actualRequest.referenceNote).toBe('PO-2026-0042');
  });
  it.each([
    { scenario: 'a non-UUID SKU', patch: { skuId: 'sku-1' } },
    { scenario: 'a zero quantity', patch: { quantity: 0 } },
    { scenario: 'a fractional quantity', patch: { quantity: 1.5 } },
    { scenario: 'a quantity over 1,000,000', patch: { quantity: 1_000_001 } },
    {
      scenario: 'a note over 500 characters',
      patch: { referenceNote: 'n'.repeat(501) },
    },
  ])('should reject $scenario', ({ patch }) => {
    // Arrange
    const inputProps: RestockRequestProps = { ...VALID_PROPS, ...patch };
    // Act
    const actualResult: Result<RestockRequest, InvalidRestockError> =
      RestockRequest.create(inputProps);
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(InvalidRestockError);
  });
});

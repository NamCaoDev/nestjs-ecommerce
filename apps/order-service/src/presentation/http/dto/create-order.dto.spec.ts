import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

const VALID_BODY: Record<string, unknown> = {
  customerId: '0199a7c0-0000-7000-8000-0000000000c1',
  currency: 'USD',
  items: [
    {
      skuId: '0199a7c0-0000-7000-8000-0000000000a1',
      productName: 'Mug',
      quantity: 2,
      unitPrice: 19.99,
    },
  ],
  shippingAddress: {
    recipientName: 'Nguyen Van A',
    phoneNumber: '+84900000000',
    line1: '1 Le Loi',
    city: 'Ho Chi Minh City',
    postalCode: '700000',
    countryCode: 'VN',
  },
};

/**
 * Validates a raw body the way the global ValidationPipe does.
 */
const validateBody = (body: Record<string, unknown>): ValidationError[] =>
  validateSync(plainToInstance(CreateOrderDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('CreateOrderDto', () => {
  it('should accept a valid body', () => {
    // Arrange
    const inputBody: Record<string, unknown> = VALID_BODY;
    // Act
    const actualErrors: ValidationError[] = validateBody(inputBody);
    // Assert
    expect(actualErrors).toEqual([]);
  });
  it.each([
    { scenario: 'a non-UUID customer', patch: { customerId: 'c-1' } },
    { scenario: 'an unknown currency', patch: { currency: 'XXY' } },
    { scenario: 'no items', patch: { items: [] } },
    {
      scenario: 'a zero quantity',
      patch: {
        items: [
          {
            skuId: '0199a7c0-0000-7000-8000-0000000000a1',
            productName: 'Mug',
            quantity: 0,
            unitPrice: 1,
          },
        ],
      },
    },
    {
      scenario: 'a price with five decimals',
      patch: {
        items: [
          {
            skuId: '0199a7c0-0000-7000-8000-0000000000a1',
            productName: 'Mug',
            quantity: 1,
            unitPrice: 1.23456,
          },
        ],
      },
    },
    { scenario: 'an unexpected property', patch: { discountCode: 'FREE' } },
  ])('should reject $scenario', ({ patch }) => {
    // Arrange
    const inputBody: Record<string, unknown> = { ...VALID_BODY, ...patch };
    // Act
    const actualErrors: ValidationError[] = validateBody(inputBody);
    // Assert
    expect(actualErrors.length).toBeGreaterThan(0);
  });
});

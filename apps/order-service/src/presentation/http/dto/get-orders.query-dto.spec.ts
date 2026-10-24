import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { GetOrdersQueryDto } from './get-orders.query-dto';

const CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';

describe('GetOrdersQueryDto', () => {
  it('should convert query strings and default the page to 1 and the limit to 20', () => {
    // Arrange
    const inputQuery: Record<string, string> = { customerId: CUSTOMER_ID };
    // Act
    const actualDto: GetOrdersQueryDto = plainToInstance(
      GetOrdersQueryDto,
      inputQuery,
    );
    // Assert
    expect(validateSync(actualDto)).toEqual([]);
    expect(actualDto).toMatchObject({ page: 1, limit: 20 });
  });
  it.each([
    { scenario: 'a missing customer', query: { page: '1' } },
    { scenario: 'page 0', query: { customerId: CUSTOMER_ID, page: '0' } },
    {
      scenario: 'a limit over 100',
      query: { customerId: CUSTOMER_ID, limit: '101' },
    },
    {
      scenario: 'a non-numeric page',
      query: { customerId: CUSTOMER_ID, page: 'abc' },
    },
  ])('should reject $scenario', ({ query }) => {
    // Arrange
    const inputDto: GetOrdersQueryDto = plainToInstance(
      GetOrdersQueryDto,
      query,
    );
    // Act
    const actualErrors: ValidationError[] = validateSync(inputDto);
    // Assert
    expect(actualErrors.length).toBeGreaterThan(0);
  });
});

import { toHeaderRecord } from './to-header-record.util';

describe('toHeaderRecord', () => {
  it('should flatten headers and drop missing values', () => {
    // Arrange
    const inputHeaders: Record<string, string | string[] | undefined> = {
      'x-webhook-signature': 'abc',
      'x-forwarded-for': ['1.1.1.1', '2.2.2.2'],
      'x-absent': undefined,
    };
    // Act
    const actualHeaders: Record<string, string> = toHeaderRecord(inputHeaders);
    // Assert
    expect(actualHeaders).toEqual({
      'x-webhook-signature': 'abc',
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
    });
  });
});

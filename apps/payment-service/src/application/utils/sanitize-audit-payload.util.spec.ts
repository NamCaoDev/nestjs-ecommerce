import { sanitizeAuditPayload } from './sanitize-audit-payload.util';

describe('sanitizeAuditPayload', () => {
  it('should mask secrets, signatures and card data at any depth', () => {
    // Arrange
    const inputPayload: Record<string, unknown> = {
      orderId: 'o1',
      vnp_SecureHash: 'abc',
      request: { 'x-webhook-signature': 'def', cardNumber: '4111', amount: 10 },
      items: [{ token: 't', sku: 's' }],
    };
    // Act
    const actualPayload: unknown = sanitizeAuditPayload(inputPayload);
    // Assert
    expect(actualPayload).toEqual({
      orderId: 'o1',
      vnp_SecureHash: '***',
      request: { 'x-webhook-signature': '***', cardNumber: '***', amount: 10 },
      items: [{ token: '***', sku: 's' }],
    });
  });
  it('should cut nesting beyond five levels', () => {
    // Arrange
    const inputPayload: Record<string, unknown> = {
      a: { b: { c: { d: { e: { f: { g: 1 } } } } } },
    };
    // Act
    const actualPayload: unknown = sanitizeAuditPayload(inputPayload);
    // Assert
    expect(JSON.stringify(actualPayload)).toBe(
      '{"a":{"b":{"c":{"d":{"e":{"f":"***"}}}}}}',
    );
  });
});

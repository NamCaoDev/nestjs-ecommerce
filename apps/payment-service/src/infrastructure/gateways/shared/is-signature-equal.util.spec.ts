import { computeHmac } from './compute-hmac.util';
import { isSignatureEqual } from './is-signature-equal.util';

describe('signature utilities', () => {
  it('should compute the hex HMAC of a payload', () => {
    // Arrange
    const inputPayload: string =
      '{"orderId":"0199a7c0-0000-7000-8000-000000000001","gatewayTxId":"tx-1","status":"SUCCESS"}';
    // Act
    const actualSignature: string = computeHmac({
      algorithm: 'sha256',
      secret: 'test-secret',
      payload: inputPayload,
    });
    // Assert (reference: printf '%s' "$payload" | openssl dgst -sha256 -hmac 'test-secret')
    expect(actualSignature).toBe(
      '5b803a5fae2e373f0a6465e17d5c738b6978f228aab8281ae8636c7161c36953',
    );
  });
  it.each([
    { inputReceived: 'ABCDEF', expectedIsEqual: true },
    { inputReceived: 'abcdee', expectedIsEqual: false },
    { inputReceived: 'abcd', expectedIsEqual: false },
    { inputReceived: '', expectedIsEqual: false },
  ])(
    'should compare $inputReceived with abcdef as $expectedIsEqual',
    ({ inputReceived, expectedIsEqual }) => {
      // Arrange
      // Act
      const actualIsEqual: boolean = isSignatureEqual({
        expected: 'abcdef',
        received: inputReceived,
      });
      // Assert
      expect(actualIsEqual).toBe(expectedIsEqual);
    },
  );
});

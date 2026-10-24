import { timingSafeEqual } from 'node:crypto';

/**
 * Compares two hex signatures in constant time (case-insensitive), so response times leak nothing
 * about the expected value.
 *
 * @param input - Expected and received signatures.
 * @returns `true` when they match.
 */
export function isSignatureEqual({
  expected,
  received,
}: {
  readonly expected: string;
  readonly received: string;
}): boolean {
  const expectedBuffer: Buffer = Buffer.from(expected.toLowerCase(), 'utf8');
  const receivedBuffer: Buffer = Buffer.from(received.toLowerCase(), 'utf8');
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

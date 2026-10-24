/**
 * Normalises a raw request body to the exact text that was signed.
 *
 * @param rawBody - Buffer, string, or an already parsed object.
 * @returns The body text.
 */
export function toRawBodyText(rawBody: unknown): string {
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.toString('utf8');
  }
  if (typeof rawBody === 'string') {
    return rawBody;
  }
  return rawBody === undefined || rawBody === null
    ? ''
    : JSON.stringify(rawBody);
}

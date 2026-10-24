import { createHmac } from 'node:crypto';
import { ComputeHmacInput } from './compute-hmac.input';

/**
 * @param input - Hash, secret and payload.
 * @returns The lowercase hex HMAC of the payload.
 */
export function computeHmac({
  algorithm,
  secret,
  payload,
}: ComputeHmacInput): string {
  return createHmac(algorithm, secret).update(payload, 'utf8').digest('hex');
}

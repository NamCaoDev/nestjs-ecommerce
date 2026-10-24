import { GatewayPayload } from '../../domain/types/gateway-payload.type';

/**
 * Converts a value to plain JSON (dates become ISO strings) for storage as a gateway payload.
 *
 * @param value - Object to convert.
 * @returns Its JSON copy.
 */
export function toGatewayPayload(value: object): GatewayPayload {
  return JSON.parse(JSON.stringify(value)) as GatewayPayload;
}

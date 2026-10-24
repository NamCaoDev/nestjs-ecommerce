import type { IncomingHttpHeaders } from 'node:http';

/**
 * Flattens request headers to `name → value` (lower-cased names, repeated headers joined by `, `).
 *
 * @param headers - Node request headers.
 * @returns The plain record handed to gateway adapters.
 */
export function toHeaderRecord(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(
        (entry: [string, string | string[] | undefined]): boolean =>
          entry[1] !== undefined,
      )
      .map(
        ([name, value]: [string, string | string[] | undefined]): [
          string,
          string,
        ] => [name, Array.isArray(value) ? value.join(', ') : String(value)],
      ),
  );
}

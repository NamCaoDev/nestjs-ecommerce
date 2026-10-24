import { Prisma } from '../prisma/generated/client';

/**
 * Narrows plain JSON data to Prisma's JSON input, `undefined` becoming SQL NULL.
 *
 * @param value - Plain JSON object or array.
 * @returns The Prisma JSON input.
 */
export function toJsonInput(
  value: object | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

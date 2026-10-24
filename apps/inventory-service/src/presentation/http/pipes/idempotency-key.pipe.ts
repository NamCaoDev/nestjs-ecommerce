import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Longest accepted key; matches `orders.idempotency_key VARCHAR(128)`. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * Requires a non-blank `Idempotency-Key` header of at most 128 characters (CLAUDE.md §4.3).
 */
@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<
  string | undefined,
  string
> {
  /**
   * @param value - Raw header value.
   * @returns The trimmed key.
   * @throws {BadRequestException} When the header is missing, blank or too long.
   */
  public transform(value: string | undefined): string {
    const key: string = value?.trim() ?? '';
    if (key.length === 0) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      );
    }
    return key;
  }
}

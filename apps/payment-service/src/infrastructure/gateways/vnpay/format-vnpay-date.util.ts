import { VNPAY } from './vnpay.constants';

/** Milliseconds per minute. */
const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * @param date - Instant to format.
 * @returns `yyyyMMddHHmmss` in Vietnam time, as VNPay expects.
 */
export function formatVnpayDate(date: Date): string {
  const local: Date = new Date(
    date.getTime() + VNPAY.TIMEZONE_OFFSET_MINUTES * MILLISECONDS_PER_MINUTE,
  );
  return local
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 'yyyyMMddHHmmss'.length);
}

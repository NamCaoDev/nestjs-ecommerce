/**
 * Input of {@link computeHmac}.
 */
export interface ComputeHmacInput {
  /** Hash, e.g. `sha256` or `sha512`. */
  readonly algorithm: string;
  readonly secret: string;
  readonly payload: string;
}

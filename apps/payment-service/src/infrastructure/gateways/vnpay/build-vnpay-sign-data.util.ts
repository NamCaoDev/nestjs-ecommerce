/**
 * Builds the string VNPay signs: parameters sorted by name, values URL-encoded with spaces as `+`,
 * joined as a query string.
 *
 * @param params - Parameters without `vnp_SecureHash` / `vnp_SecureHashType`.
 * @returns The data to sign, which is also the query string of the payment URL.
 */
export function buildVnpaySignData(
  params: Readonly<Record<string, string>>,
): string {
  return Object.keys(params)
    .sort()
    .map(
      (key: string): string =>
        `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
    )
    .join('&');
}

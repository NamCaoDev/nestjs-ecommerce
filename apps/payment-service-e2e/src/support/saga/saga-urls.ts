/** Base URLs of the services taking part in the saga. */
export const SAGA_URLS = {
  ORDER: process.env['E2E_ORDER_URL'] ?? 'http://localhost:3100',
  PAYMENT: process.env['E2E_PAYMENT_URL'] ?? 'http://localhost:3300',
} as const;

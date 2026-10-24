/**
 * Plain JSON object received from or sent to a payment gateway, kept as is for audits.
 */
export type GatewayPayload = Readonly<Record<string, unknown>>;

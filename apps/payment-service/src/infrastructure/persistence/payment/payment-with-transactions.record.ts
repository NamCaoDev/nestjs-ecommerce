import { Prisma } from '../prisma/generated/client';

/**
 * Row of `payments` loaded with its ledger, oldest entry first.
 */
export type PaymentWithTransactionsRecord = Prisma.PaymentGetPayload<{
  include: { transactions: true };
}>;

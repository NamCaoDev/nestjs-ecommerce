/**
 * Lifecycle and raw-query surface shared by every generated `PrismaClient`.
 */
export interface PrismaClientLike {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $executeRawUnsafe(query: string): Promise<number>;
}

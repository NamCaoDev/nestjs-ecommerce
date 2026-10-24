/**
 * Result of an atomic release: `RELEASED`, or `NOT_FOUND` when the reservation is unknown,
 * already released or expired.
 */
export type ReleaseOutcome = 'RELEASED' | 'NOT_FOUND';

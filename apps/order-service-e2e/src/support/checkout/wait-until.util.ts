/** Pause between two polls. */
const POLL_INTERVAL_MS = 250;

/**
 * Polls a probe until it returns a defined value or the timeout elapses.
 *
 * @param input - Probe and timeout.
 * @returns The first defined value returned by the probe.
 * @throws {Error} When the timeout elapses first.
 */
export async function waitUntil<T>({
  probe,
  timeoutMs,
  description,
}: {
  readonly probe: () => Promise<T | undefined>;
  readonly timeoutMs: number;
  readonly description: string;
}): Promise<T> {
  const deadline: number = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value: T | undefined = await probe();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve: (value: unknown) => void): void => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(
    `Timed out after ${timeoutMs} ms waiting for ${description}.`,
  );
}

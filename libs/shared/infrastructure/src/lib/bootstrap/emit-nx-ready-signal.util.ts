/** Signature of `emitReadySignal` in `@nx/js/ready-signal`. */
type EmitReadySignal = (server: unknown) => boolean;

/**
 * Tells `nx serve` (which waits on `NX_READY_SIGNAL_SOCKET`) that the HTTP server is listening.
 * A no-op outside `nx serve` or when `@nx/js` is not installed (production images).
 *
 * @param server - Listening HTTP server.
 */
export async function emitNxReadySignal(server: unknown): Promise<void> {
  if (process.env['NX_READY_SIGNAL_SOCKET'] === undefined) {
    return;
  }
  try {
    const load: (
      specifier: string,
    ) => Promise<{ emitReadySignal: EmitReadySignal }> = new Function(
      'specifier',
      'return import(specifier)',
    ) as (specifier: string) => Promise<{ emitReadySignal: EmitReadySignal }>;
    (await load('@nx/js/ready-signal')).emitReadySignal(server);
  } catch {
    return;
  }
}

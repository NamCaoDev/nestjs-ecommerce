/**
 * Constructor input of {@link AbstractPollingWorker}.
 */
export interface PollingWorkerProps {
  /** Feature flag turning the worker on or off (default on), e.g. `OUTBOX_RELAY_ENABLED`. */
  readonly enabledFlag: string;
  /** Variable holding the pause between ticks in ms, e.g. `OUTBOX_RELAY_INTERVAL_MS`. */
  readonly intervalVariable: string;
  readonly defaultIntervalMs: number;
}

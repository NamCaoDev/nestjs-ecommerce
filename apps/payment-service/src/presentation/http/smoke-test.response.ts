/**
 * Response body of the `GET admin/test` smoke-test endpoint.
 */
export interface SmokeTestResponse {
  /** Always `ok` while the process is serving requests. */
  readonly status: 'ok';
  /** Name of the responding service. */
  readonly service: string;
  /** Server time in epoch milliseconds. */
  readonly timestamp: number;
}

import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

/** HTTP ports of the three services taking part in the saga. */
const SERVICE_PORTS = [3200, 3100, 3300];

module.exports = async function () {
  // The services are started by `nx e2e payment-service-e2e` (serve targets); wait until they listen.
  console.log('\nSetting up...\n');
  const host = process.env.HOST ?? 'localhost';
  for (const port of SERVICE_PORTS) {
    await waitForPortOpen(port, { host });
  }
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};

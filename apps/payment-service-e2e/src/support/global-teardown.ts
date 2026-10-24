import { killPort } from '@nx/node/utils';
/* eslint-disable */

/** HTTP ports of the services started for this suite. */
const SERVICE_PORTS = [3300, 3100, 3200];

module.exports = async function () {
  // Free the ports so the next suite can start its own instances.
  for (const port of SERVICE_PORTS) {
    await killPort(port);
  }
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};

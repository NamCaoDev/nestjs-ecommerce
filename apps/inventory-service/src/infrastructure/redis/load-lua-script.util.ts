import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Folder holding the Lua scripts: next to this file in sources, copied to `dist/scripts` by webpack. */
const SCRIPTS_DIRECTORY: string = join(__dirname, 'scripts');

/**
 * Reads a Lua script shipped with the service.
 *
 * @param fileName - Script file name, e.g. `atomic_reserve.lua`.
 * @returns The script source.
 */
export function loadLuaScript(fileName: string): string {
  return readFileSync(join(SCRIPTS_DIRECTORY, fileName), 'utf8');
}

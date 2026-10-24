/**
 * Custom commands registered on the Redis client with `defineCommand` (EVALSHA with EVAL fallback).
 * See each script header for keys, arguments and replies.
 */
export interface InventoryLuaCommands {
  /** Runs `atomic_reserve.lua`. */
  atomicReserve(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): Promise<number>;
  /** Runs `atomic_release.lua`. */
  atomicRelease(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): Promise<number>;
  /** Runs `atomic_commit.lua`; replies `[code, isReacquired]`. */
  atomicCommit(
    numberOfKeys: number,
    ...keysAndArguments: (string | number)[]
  ): Promise<number[]>;
}

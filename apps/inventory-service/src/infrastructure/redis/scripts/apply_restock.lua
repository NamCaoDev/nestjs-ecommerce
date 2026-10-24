-- Applies a `stock.restocked` outbox event to the cached total exactly once.
--
-- KEYS[1]  stock hash        inventory:stock:{skuId}
-- KEYS[2]  applied marker    inventory:applied_restock:{eventId}
-- ARGV[1]  quantity received
-- ARGV[2]  marker retention in seconds
--
-- Returns 1 when applied, 2 when already applied (redelivered event), 0 when the SKU is not cached
-- (nothing to add: the next restore from PostgreSQL includes the receipt; the event is marked applied).

local SKU_NOT_CACHED = 0
local APPLIED = 1
local ALREADY_APPLIED = 2

if redis.call('EXISTS', KEYS[2]) == 1 then
  return ALREADY_APPLIED
end
redis.call('SET', KEYS[2], 1, 'EX', tonumber(ARGV[2]))
if redis.call('EXISTS', KEYS[1]) == 0 then
  return SKU_NOT_CACHED
end
redis.call('HINCRBY', KEYS[1], 'total', tonumber(ARGV[1]))
return APPLIED

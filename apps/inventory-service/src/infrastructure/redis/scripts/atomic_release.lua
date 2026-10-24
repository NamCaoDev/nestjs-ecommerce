-- Atomically releases a RESERVED reservation (compensation or expiry). Idempotent.
--
-- KEYS[1]        reservation hash   inventory:reservation:{reservationKey}
-- KEYS[2]        expiry queue       inventory:reservation_expirations
-- KEYS[3..n+2]   stock hashes       inventory:stock:{skuId}
-- ARGV[1]        reservationKey (ZSET member)
-- ARGV[2..n+1]   quantity to release for KEYS[i]
--
-- Returns 1 when released, 0 when the reservation is unknown, already released or COMMITTED
-- (committed stock has left the warehouse and can no longer be released).

local RELEASED = 1
local NOT_FOUND = 0
local FIRST_STOCK_KEY = 3
local QUANTITY_OFFSET = -1

if redis.call('HGET', KEYS[1], 'status') ~= 'RESERVED' then
  return NOT_FOUND
end

for i = FIRST_STOCK_KEY, #KEYS do
  local reserved = tonumber(redis.call('HGET', KEYS[i], 'reserved') or '0')
  local quantity = math.min(tonumber(ARGV[i + QUANTITY_OFFSET]), reserved)
  redis.call('HINCRBY', KEYS[i], 'reserved', -quantity)
end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return RELEASED

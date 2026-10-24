-- Atomically reserves stock for every SKU of a reservation, or for none (CLAUDE.md §4.1).
--
-- KEYS[1]        reservation hash   inventory:reservation:{reservationKey}
-- KEYS[2]        expiry queue       inventory:reservation_expirations  (ZSET, score = expiry in epoch ms)
-- KEYS[3]        order index        inventory:reservation_order:{orderId} -> reservationKey
-- KEYS[4..n+3]   stock hashes       inventory:stock:{skuId}  (fields: total, reserved)
-- ARGV[1]        reservation lifetime in seconds before the sweeper releases it
-- ARGV[2]        retention in seconds of the reservation hash and order index (garbage collection only)
-- ARGV[3]        reservationKey (ZSET member)
-- ARGV[4]        orderId
-- ARGV[5]        items as JSON [{skuId, quantity}], read back by commit and the sweeper
-- ARGV[6..n+5]   quantity to reserve for KEYS[i]
--
-- Returns 1 when reserved, 0 when any SKU is short of stock,
-- 3 when a stock hash is missing (cold cache: the caller restores it from PostgreSQL and retries),
-- 2 when the reservation already exists (idempotent replay: nothing is reserved twice,
-- but the replaying order is indexed so its order.placed event can still commit it).
-- Expiry is driven by the ZSET, never by the hash TTL, so the sweeper always finds what it must release.

local RESERVED = 1
local INSUFFICIENT_STOCK = 0
local ALREADY_RESERVED = 2
local STOCK_NOT_LOADED = 3
local FIRST_STOCK_KEY = 4
local QUANTITY_OFFSET = 2

if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('SET', KEYS[3], ARGV[3], 'EX', tonumber(ARGV[2]))
  return ALREADY_RESERVED
end

for i = FIRST_STOCK_KEY, #KEYS do
  local quantity = tonumber(ARGV[i + QUANTITY_OFFSET])
  local total = tonumber(redis.call('HGET', KEYS[i], 'total'))
  if total == nil then
    return STOCK_NOT_LOADED
  end
  local reserved = tonumber(redis.call('HGET', KEYS[i], 'reserved') or '0')
  if total - reserved < quantity then
    return INSUFFICIENT_STOCK
  end
end

for i = FIRST_STOCK_KEY, #KEYS do
  redis.call('HINCRBY', KEYS[i], 'reserved', tonumber(ARGV[i + QUANTITY_OFFSET]))
end

local now = redis.call('TIME')
local expiresAt = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000) + tonumber(ARGV[1]) * 1000
redis.call('HSET', KEYS[1], 'status', 'RESERVED', 'orderId', ARGV[4], 'items', ARGV[5], 'expiresAt', expiresAt)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
redis.call('ZADD', KEYS[2], expiresAt, ARGV[3])
redis.call('SET', KEYS[3], ARGV[3], 'EX', tonumber(ARGV[2]))
return RESERVED

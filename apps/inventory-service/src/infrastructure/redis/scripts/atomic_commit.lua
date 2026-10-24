-- Atomically ships the stock of a placed order. Idempotent: redelivered events never ship twice.
--
-- KEYS[1]        reservation hash   inventory:reservation:{reservationKey}
-- KEYS[2]        expiry queue       inventory:reservation_expirations
-- KEYS[3..n+2]   stock hashes       inventory:stock:{skuId}
-- ARGV[1]        reservationKey (ZSET member)
-- ARGV[2]        retention in seconds of the COMMITTED marker (deduplicates redelivered events)
-- ARGV[3]        orderId
-- ARGV[4]        items as JSON [{skuId, quantity}]
-- ARGV[5..n+4]   quantity to ship for KEYS[i]
--
-- Returns {code, isReacquired}:
--   {1, 0} COMMITTED                  the reservation was RESERVED: total and reserved decrease
--   {2, m} ALREADY_COMMITTED          redelivery; m tells how the first commit was made
--   {3, 1} REACQUIRED_AND_COMMITTED   the reservation was gone (expired/released) but the stock was
--                                     still available: only total decreases (reserved was already freed)
--   {0, 0} EXPIRED_AND_OUT_OF_STOCK   the reservation was gone and the stock is no longer available
--   {4, 0} STOCK_NOT_LOADED           a stock hash is missing (cold cache): the caller restores it and retries

local EXPIRED_AND_OUT_OF_STOCK = 0
local COMMITTED = 1
local ALREADY_COMMITTED = 2
local REACQUIRED_AND_COMMITTED = 3
local STOCK_NOT_LOADED = 4
local FIRST_STOCK_KEY = 3
local QUANTITY_OFFSET = 2

local function mark_committed(commit_mode)
  redis.call('HSET', KEYS[1], 'status', 'COMMITTED', 'commitMode', commit_mode, 'orderId', ARGV[3], 'items', ARGV[4])
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  redis.call('ZREM', KEYS[2], ARGV[1])
end

local status = redis.call('HGET', KEYS[1], 'status')
if status == 'COMMITTED' then
  local reacquired = redis.call('HGET', KEYS[1], 'commitMode') == 'REACQUIRED' and 1 or 0
  return {ALREADY_COMMITTED, reacquired}
end

for i = FIRST_STOCK_KEY, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 0 then
    return {STOCK_NOT_LOADED, 0}
  end
end

if status == 'RESERVED' then
  for i = FIRST_STOCK_KEY, #KEYS do
    local quantity = tonumber(ARGV[i + QUANTITY_OFFSET])
    redis.call('HINCRBY', KEYS[i], 'total', -quantity)
    redis.call('HINCRBY', KEYS[i], 'reserved', -quantity)
  end
  mark_committed('RESERVED')
  return {COMMITTED, 0}
end

for i = FIRST_STOCK_KEY, #KEYS do
  local quantity = tonumber(ARGV[i + QUANTITY_OFFSET])
  local total = tonumber(redis.call('HGET', KEYS[i], 'total'))
  local reserved = tonumber(redis.call('HGET', KEYS[i], 'reserved') or '0')
  if total - reserved < quantity then
    return {EXPIRED_AND_OUT_OF_STOCK, 0}
  end
end
for i = FIRST_STOCK_KEY, #KEYS do
  redis.call('HINCRBY', KEYS[i], 'total', -tonumber(ARGV[i + QUANTITY_OFFSET]))
end
mark_committed('REACQUIRED')
return {REACQUIRED_AND_COMMITTED, 1}

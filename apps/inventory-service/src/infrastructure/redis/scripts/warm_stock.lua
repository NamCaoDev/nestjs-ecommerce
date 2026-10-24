-- Restores the counters of a SKU from a PostgreSQL snapshot, only while Redis has no entry for it, so
-- live counters are never overwritten. No expiry on the hash: the reservation scripts depend on it.
-- The snapshot already includes its pending `stock.restocked` events, so they are marked as applied in
-- the same atomic step; the outbox relay then skips them instead of adding them a second time.
--
-- KEYS[1]       stock hash         inventory:stock:{skuId}
-- KEYS[2..n]    applied markers    inventory:applied_restock:{eventId}  (pending events in the snapshot)
-- ARGV[1]       total
-- ARGV[2]       reserved
-- ARGV[3]       marker retention in seconds
--
-- Returns 1 when restored, 0 when the entry already existed (nothing written).

if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('HSET', KEYS[1], 'total', ARGV[1], 'reserved', ARGV[2])
for i = 2, #KEYS do
  redis.call('SET', KEYS[i], 1, 'EX', tonumber(ARGV[3]))
end
return 1

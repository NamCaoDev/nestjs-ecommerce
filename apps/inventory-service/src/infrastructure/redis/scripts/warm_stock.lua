-- Restores the counters of a SKU from PostgreSQL, only while Redis has no entry for it, so live
-- counters are never overwritten. No expiry: the reservation scripts depend on this hash.
--
-- KEYS[1]  stock hash   inventory:stock:{skuId}
-- ARGV[1]  total
-- ARGV[2]  reserved
--
-- Returns 1 when restored, 0 when the entry already existed.

if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('HSET', KEYS[1], 'total', ARGV[1], 'reserved', ARGV[2])
return 1

# System Design — NestJS E-commerce (Order & Inventory)

> Status: reflects the code on branch `feat/order-service` (commit `f137d50` and later).
> Per-feature message flows live in [`message-flows/`](./message-flows/README.md).

## 1. Scope and goals

The system takes customer orders and guarantees that **stock is never oversold**, even under concurrent
checkouts, crashes, retries and partial outages of Redis or Kafka.

| Goal                             | How it is achieved                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| No overselling under concurrency | Stock checks and changes run as atomic Lua scripts on Redis (CLAUDE.md §4.1)                 |
| No lost or phantom events        | Transactional outbox in both services (CLAUDE.md §4.2)                                       |
| Safe retries                     | `Idempotency-Key` on every state-changing request, Redis `SET NX EX` + DB unique keys (§4.3) |
| Service autonomy                 | Database per service, no cross-service joins or FKs, logical UUIDs and JSON snapshots (§4.4) |
| No stuck stock                   | Reservations expire (ZSET + sweeper) unless the order is committed                           |
| Recoverable cache                | Redis counters are restored from PostgreSQL on demand and at startup                         |

Out of scope today: payments, customers/catalog services, authentication, shipping.

## 2. Bounded contexts

```mermaid
flowchart LR
  subgraph Ordering["Ordering context (order-service)"]
    O[Order aggregate<br/>OrderItem, Money, AddressSnapshot, OrderCode]
  end
  subgraph Inventory["Inventory context (inventory-service)"]
    S[InventoryStock<br/>StockReservation, RestockRequest]
  end
  Customer([Customer / BFF]) -->|REST| Ordering
  Ordering -->|gRPC ReserveStock / ReleaseStock<br/>customer-supplier| Inventory
  Ordering -. "orders.events (order.placed, order.cancelled...)" .-> Inventory
  Inventory -. "inventory.events (stock.reservation_failed)" .-> Ordering
  Warehouse([Warehouse operator]) -->|REST restock| Inventory
```

| Relationship                           | Pattern                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Ordering → Inventory (reserve/release) | Synchronous customer–supplier over gRPC, contract in `libs/proto/inventory.proto` |
| Ordering ⇄ Inventory (events)          | Published language: `@org/contracts` (payloads, envelope, topic names)            |
| Shared kernel                          | `@org/shared-domain` (ValueObject, Entity, AggregateRoot, Result, DomainError)    |

## 3. C4 model

### 3.1 Level 1 — System context

```mermaid
flowchart TB
  customer(["<b>Customer</b><br/>[Person]<br/>Places and tracks orders"]):::person
  operator(["<b>Warehouse operator</b><br/>[Person]<br/>Records goods received"]):::person
  bff["<b>Storefront / BFF</b><br/>[Software System, future]<br/>Authentication, aggregation"]:::external
  platform["<b>E-commerce platform</b><br/>[Software System]<br/>Order placement with guaranteed<br/>stock reservation"]:::system
  payment["<b>Payment provider</b><br/>[Software System, not integrated]"]:::external
  customer -- "Uses<br/>[HTTPS]" --> bff
  bff -- "Places and queries orders<br/>[REST/JSON]" --> platform
  operator -- "Restocks SKUs<br/>[REST/JSON]" --> platform
  platform -. "Future: charges orders" .-> payment
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
```

### 3.2 Level 2 — Containers

```mermaid
flowchart LR
  customer(["<b>Customer / BFF</b><br/>[Person]"]):::person
  operator(["<b>Warehouse operator</b><br/>[Person]"]):::person
  subgraph platform["E-commerce platform [Software System]"]
    direction LR
      order["<b>order-service</b><br/>[Container: NestJS, Node 24]<br/>Orders REST API, outbox relay,<br/>inventory.events consumer"]:::container
    inventory["<b>inventory-service</b><br/>[Container: NestJS, Node 24]<br/>gRPC reservation, stock REST API,<br/>orders.events consumer, sweeper, outbox relay"]:::container
    kafka[["<b>Redpanda</b><br/>[Container: Kafka API]<br/>orders.events, inventory.events<br/>3 partitions each"]]:::container
    orderDb[("<b>order_db</b><br/>[Container: PostgreSQL 16]<br/>orders, order_items, outbox_events")]:::container
    redis[("<b>Redis 7.2</b><br/>[Container: AOF]<br/>Idempotency keys, stock counters,<br/>reservations, expiry queue")]:::container
    inventoryDb[("<b>inventory_db</b><br/>[Container: PostgreSQL 16]<br/>inventory_stocks, stock_ledger, outbox_events")]:::container
  end
  customer -- "POST / GET /api/orders<br/>[HTTPS/JSON]" --> order
  operator -- "POST /api/inventory/stocks/restock<br/>[HTTPS/JSON]" --> inventory
  order -- "ReserveStock / ReleaseStock<br/>[gRPC :50051]" --> inventory
  order -- "Publishes orders.events<br/>Consumes inventory.events" <--> kafka
  kafka <-- "Consumes orders.events<br/>Publishes inventory.events" --> inventory
  order -- "Reads / writes<br/>[Prisma + pg]" --> orderDb
  order -- "Idempotency-Key locks<br/>[RESP]" --> redis
  inventory -- "Lua scripts on stock<br/>and reservations [RESP]" --> redis
  inventory -- "Reads / writes<br/>[Prisma + pg]" --> inventoryDb
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
  class platform boundary
```

| Container          | Inbound                                                         | Outbound                                           | Ports (local)                              |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| order-service      | REST `/api/orders`, `inventory.events`                          | gRPC → inventory, `orders.events`, order_db, Redis | HTTP 3100, Swagger `/api/docs`             |
| inventory-service  | gRPC `InventoryService`, REST `/api/inventory`, `orders.events` | `inventory.events`, inventory_db, Redis            | HTTP 3200, gRPC 50051                      |
| PostgreSQL         | —                                                               | —                                                  | 5433 (host), 5432 (compose network)        |
| Redis              | —                                                               | —                                                  | 6379                                       |
| Redpanda / Console | —                                                               | —                                                  | 9092 (host), 29092 (compose), Console 8088 |

### 3.3 Level 3 — Components of order-service

```mermaid
flowchart TB
  subgraph svc["order-service [Container]"]
    direction TB
    subgraph presentation["Presentation"]
      direction LR
      ctrl["<b>OrderController</b><br/>[Component: REST]<br/>POST /orders, GET /orders, GET /orders/:id"]:::component
      consumer["<b>InventoryEventsConsumer</b><br/>[Component: Kafka]<br/>consumes inventory.events:<br/>stock.reservation_failed → CancelOrder"]:::component
      relay["<b>OutboxRelayService</b><br/>[Component: worker]<br/>every 1 s → RelayOutbox"]:::component
    end
    handlers["<b>Command and query handlers</b><br/>[Component: Application / CQRS]<br/>CreateOrder, CancelOrder, RelayOutbox,<br/>GetOrderById, GetOrdersByCustomer"]:::component
    domain["<b>Order aggregate</b><br/>[Component: Domain, pure TS]<br/>Invariants, domain events"]:::component
    subgraph infrastructure["Infrastructure adapters"]
      direction LR
      repo["<b>OrderPrismaRepository<br/>OrderReadPrismaRepository</b><br/>[Component]<br/>Order + outbox in one TX; read models"]:::component
      idem["<b>RedisIdempotencyAdapter</b><br/>[Component]<br/>SET NX EX"]:::component
      grpc["<b>InventoryGrpcClientAdapter</b><br/>[Component]<br/>ReserveStock / ReleaseStock, 3 s timeout"]:::component
      pub["<b>KafkaEventPublisher</b><br/>[Component]<br/>orders.events"]:::component
    end
  end
  orderDb[("<b>order_db</b><br/>[Container: PostgreSQL]")]:::container
  redis[("<b>Redis</b><br/>[Container]")]:::container
  inventory["<b>inventory-service</b><br/>[Container]"]:::container
  kafka[["<b>Redpanda</b><br/>[Container]"]]:::container
  ctrl -- "CommandBus / QueryBus" --> handlers
  consumer -- "CommandBus" --> handlers
  relay -- "CommandBus" --> handlers
  handlers -- "creates / mutates" --> domain
  handlers -- "OrderRepositoryPort<br/>OrderReadPort" --> repo
  handlers -- "IdempotencyPort" --> idem
  handlers -- "InventoryRpcPort" --> grpc
  handlers -- "EventPublisherPort" --> pub
  repo -- "SQL" --> orderDb
  idem -- "RESP" --> redis
  grpc -- "gRPC" --> inventory
  pub -- "Kafka" --> kafka
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
  class svc boundary
```

### 3.4 Level 3 — Components of inventory-service

```mermaid
flowchart TB
  subgraph svc["inventory-service [Container]"]
    direction TB
    subgraph presentation["Presentation"]
      direction LR
      grpcCtrl["<b>InventoryGrpcController</b><br/>[Component: gRPC]<br/>ReserveStock, ReleaseStock"]:::component
      httpCtrl["<b>InventoryHttpController</b><br/>[Component: REST]<br/>GET stock, GET ledger, POST restock"]:::component
      consumer["<b>OrderEventsConsumer</b><br/>[Component: Kafka]<br/>consumes orders.events:<br/>order.placed → CommitStock"]:::component
      workers["<b>Workers</b><br/>[Component]<br/>ReservationSweeper 30 s, InventoryOutboxRelay 1 s,<br/>StockCacheWarmup at startup"]:::component
    end
    handlers["<b>Command and query handlers</b><br/>[Component: Application / CQRS]<br/>Reserve, Release, Commit, Restock, ReleaseExpired,<br/>RelayInventoryOutbox, WarmUp, GetStockBySku, GetStockLedger"]:::component
    warmer["<b>StockCacheWarmer</b><br/>[Component: Application service]<br/>Restores missing counters from PostgreSQL"]:::component
    domain["<b>StockReservation, RestockRequest,<br/>InventoryStock</b><br/>[Component: Domain, pure TS]"]:::component
    subgraph infrastructure["Infrastructure adapters"]
      direction LR
      redisRepo["<b>RedisInventoryRepository<br/>RedisStockCacheAdapter</b><br/>[Component]<br/>Lua scripts"]:::component
      pg["<b>Ledger, Inbound, Read, Outbox<br/>Prisma repositories</b><br/>[Component]"]:::component
      pub["<b>KafkaInventoryEventPublisher</b><br/>[Component]<br/>inventory.events"]:::component
    end
  end
  order["<b>order-service</b><br/>[Container]"]:::container
  redis[("<b>Redis</b><br/>[Container]")]:::container
  inventoryDb[("<b>inventory_db</b><br/>[Container: PostgreSQL]")]:::container
  kafka[["<b>Redpanda</b><br/>[Container]"]]:::container
  order -- "gRPC" --> grpcCtrl
  grpcCtrl -- "CommandBus" --> handlers
  httpCtrl -- "CommandBus / QueryBus" --> handlers
  consumer -- "CommandBus" --> handlers
  workers -- "CommandBus" --> handlers
  handlers -- "validates" --> domain
  handlers -- "on STOCK_NOT_LOADED" --> warmer
  handlers -- "StockReservationStorePort<br/>StockCachePort" --> redisRepo
  handlers -- "Ledger / Inbound / Read / Outbox ports" --> pg
  handlers -- "InventoryEventPublisherPort" --> pub
  warmer --> redisRepo
  redisRepo -- "EVALSHA" --> redis
  pg -- "SQL" --> inventoryDb
  pub -- "Kafka" --> kafka
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
  class svc boundary
```

### 3.5 Code structure (per service)

```
apps/<service>/src
├── domain/           pure TypeScript: aggregates, value objects, domain events, errors, repository ports
├── application/      CQRS commands/queries + handlers, outbound ports, read models
├── infrastructure/   Prisma, Redis (Lua), gRPC client, Kafka adapters
├── presentation/     REST controllers, gRPC controller, Kafka consumers, background workers
└── core/             global filters (DomainError → HTTP / gRPC status)
libs/
├── shared/domain          shared kernel (ValueObject, Entity, AggregateRoot, Result, DomainError)
├── shared/infrastructure  readEnv, RedisService, AbstractPrismaService, outbox SQL, AbstractPollingWorker, Swagger
├── shared/messaging       Kafka client (Snappy), topic manager, idempotent producer, base consumer
├── contracts              integration event payloads, envelope, topics, event types
└── proto                  inventory.proto (gRPC contract)
```

ESLint enforces the dependency rule: `src/domain/**` and `type:domain` libraries cannot import NestJS,
Prisma, Redis, Kafka, gRPC, class-validator or rxjs, nor the outer layers.

## 4. End-to-end checkout flow

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant O as order-service
  participant R as Redis
  participant I as inventory-service
  participant ODB as order_db
  participant K as Redpanda
  participant IDB as inventory_db

  C->>O: POST /api/orders + Idempotency-Key
  O->>R: SET idempotency:order:{customer}:{key} PROCESSING NX EX 120
  O->>O: Build Order aggregate (validate invariants)
  O->>I: gRPC ReserveStock(key, orderId, items)
  I->>R: atomic_reserve.lua (check + reserve + ZADD expiry)
  I->>IDB: ledger RESERVED (+ counters)
  I-->>O: success = true
  O->>ODB: TX: insert order + items + outbox(order.placed)
  O->>R: SET … COMPLETED EX 86400
  O-->>C: 201 { orderId, orderCode, totalAmount }
  loop every 1 s
    O->>ODB: claim outbox (SKIP LOCKED, lease)
    O->>K: orders.events ← order.placed (key = orderId)
    O->>ODB: mark PUBLISHED
  end
  K->>I: order.placed
  I->>R: atomic_commit.lua (ship: total−q, reserved−q, ZREM)
  I->>IDB: ledger COMMITTED (idempotent reconciliation)
```

## 5. Data model

### 5.1 order_db

```mermaid
erDiagram
  orders ||--o{ order_items : contains
  orders {
    uuid id PK
    varchar order_code UK "ORD-XXXXXXXXXXXX"
    uuid customer_id "logical ref, no FK"
    varchar idempotency_key "UNIQUE (customer_id, idempotency_key)"
    order_status status "PENDING | CONFIRMED | PAYMENT_FAILED | CANCELLED"
    json shipping_address "immutable snapshot"
    char currency
    decimal subtotal_amount
    decimal shipping_amount "0 until modelled"
    decimal discount_amount "0 until modelled"
    decimal total_amount
    int version "optimistic locking"
  }
  order_items {
    uuid id PK
    uuid order_id FK
    uuid sku_id "logical ref, UNIQUE (order_id, sku_id)"
    json product_snapshot
    decimal unit_price
    int quantity
    decimal line_total
  }
  outbox_events {
    uuid id PK "= domain event id"
    uuid aggregate_id
    varchar event_type
    json payload
    outbox_status status "PENDING | PROCESSING | PUBLISHED"
    int retry_count
    timestamptz locked_until "claim lease"
  }
```

### 5.2 inventory_db

```mermaid
erDiagram
  inventory_stocks ||--o{ stock_ledger : records
  inventory_stocks {
    uuid sku_id PK
    int total_quantity "CHECK 0 <= reserved <= total"
    int reserved_quantity
    int version
  }
  stock_ledger {
    uuid id PK
    uuid sku_id FK
    int quantity_changed "signed"
    stock_action_type action_type "RESERVED | RELEASED | COMMITTED | EXPIRED_RELEASE | RESTOCK"
    uuid order_id "null for RESTOCK; partial UNIQUE (order_id, sku_id) WHERE COMMITTED"
    varchar reservation_key
    varchar reference_note
    varchar idempotency_key UK "RESTOCK only"
  }
  outbox_events {
    uuid id PK
    uuid aggregate_id "sku_id"
    varchar event_type "stock.restocked"
    json payload
    outbox_status status
    timestamptz locked_until
  }
```

### 5.3 Redis keys

| Key                                      | Type   | Content                                                                          | Lifetime                                                                    |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `idempotency:order:{customerId}:{key}`   | string | `PROCESSING` → `COMPLETED`                                                       | 120 s while processing, 24 h when completed; deleted on failure (Lua guard) |
| `inventory:stock:{skuId}`                | hash   | `total`, `reserved`                                                              | **No TTL** — source of truth for the Lua scripts                            |
| `inventory:reservation:{reservationKey}` | hash   | `status` (`RESERVED`/`COMMITTED`), `orderId`, `items`, `expiresAt`, `commitMode` | 7 days (garbage collection only)                                            |
| `inventory:reservation_order:{orderId}`  | string | reservation key                                                                  | 7 days                                                                      |
| `inventory:reservation_expirations`      | ZSET   | member = reservation key, score = expiry (epoch ms, Redis clock)                 | Until committed/released                                                    |
| `inventory:applied_restock:{eventId}`    | string | marker                                                                           | 30 days                                                                     |

Reservation keys are `{customerId}:{Idempotency-Key}`, so retries of the same checkout reuse the same reservation.

## 6. Messaging

| Topic              | Key       | Partitions | Producer                             | Consumer group             | Events                                               |
| ------------------ | --------- | ---------- | ------------------------------------ | -------------------------- | ---------------------------------------------------- |
| `orders.events`    | `orderId` | 3          | order-service (outbox relay)         | `inventory-consumer-group` | `order.placed`, `order.confirmed`, `order.cancelled` |
| `inventory.events` | `orderId` | 3          | inventory-service (direct, see §7.4) | `order-consumer-group`     | `stock.reservation_failed`                           |

Every message value is an `IntegrationEventEnvelope` `{ eventId, eventType, aggregateId, occurredAt, payload }`
(`libs/contracts`). Producers are idempotent with one in-flight request, `acks=all`, Snappy compression.
Consumers never auto-create topics; both sides create them with the configured partition count.

Internal (non-Kafka) events: `stock.restocked` lives only in the inventory outbox and is applied to Redis.

## 7. Consistency patterns

### 7.1 Atomic stock operations (Lua)

| Script               | Purpose                                                                      | Replies                                                                                           |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `atomic_reserve.lua` | Check all lines, reserve all or none, schedule expiry, index by order        | 1 reserved · 0 insufficient · 2 already reserved · 3 stock not loaded                             |
| `atomic_release.lua` | Release a `RESERVED` reservation (compensation / expiry)                     | 1 released · 0 not found / committed                                                              |
| `atomic_commit.lua`  | Ship stock; late commit re-acquires if available                             | {1} committed · {2} already · {3} re-acquired · {0} expired & out of stock · {4} stock not loaded |
| `warm_stock.lua`     | Restore a missing hash from a PG snapshot; mark its pending receipts applied | 1 restored · 0 existed                                                                            |
| `apply_restock.lua`  | Add a receipt exactly once per event                                         | 1 applied · 2 already · 0 SKU not cached                                                          |

Measured: 200 concurrent 1-unit reservations against 100 units → exactly 100 succeed.

### 7.2 Transactional outbox

```mermaid
flowchart LR
  H[Command handler] -->|one local TX| DB[(state rows + outbox_events)]
  W[Relay worker every 1 s] -->|"claim: UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)<br/>status PROCESSING, lease 60 s<br/>oldest unpublished event per aggregate"| DB
  W -->|publish / apply| T{{Kafka or Redis}}
  W -->|PUBLISHED or back to PENDING + retry_count| DB
```

- Shared statements: `claimOutboxBatch`, `markOutboxPublished`, `markOutboxFailed` (`@org/shared-infrastructure`).
- Safe with several instances; a crashed relay's rows become claimable when the lease expires.
- Delivery is **at-least-once**: every consumer is idempotent (event id, Redis markers, DB unique keys).

### 7.3 Idempotency

| Operation                        | Mechanism                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /orders`                   | Redis `SET NX EX` per customer + key; DB `UNIQUE (customer_id, idempotency_key)` as backstop |
| `ReserveStock`                   | Reservation hash per `{customerId}:{key}`; replay returns `ALREADY_RESERVED`                 |
| `ReleaseStock`                   | Only acts while `RESERVED`                                                                   |
| `order.placed` consumption       | `COMMITTED` marker in Redis + partial unique index on the ledger                             |
| `POST /inventory/stocks/restock` | `stock_ledger.idempotency_key` UNIQUE → 409                                                  |
| `stock.restocked` apply          | `inventory:applied_restock:{eventId}` marker, atomic with `HINCRBY`                          |

### 7.4 Deliberate exceptions

- `stock.reservation_failed` is published directly (not via an outbox): the inventory path that emits it changes
  no local state, and a failed publish makes the consumer rethrow so Kafka redelivers `order.placed`.
- Order creation calls inventory synchronously (gRPC) to give the customer an immediate answer; compensation
  (`ReleaseStock`) runs if persisting the order fails, except on a duplicate key (the reservation then belongs
  to the order already stored).

## 8. Failure modes

| Failure                               | Effect                                                                              | Recovery                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Kafka down                            | Orders still accepted; outbox rows stay `PENDING`, `retry_count` grows              | Relay publishes in order once Kafka is back                                                |
| Redis down                            | `POST /orders` fails (idempotency + reservation need Redis); restock still succeeds | Inventory outbox relay applies receipts once Redis is back                                 |
| Redis data loss                       | Stock hashes missing                                                                | `STOCK_NOT_LOADED` → restore from PG + retry; startup warm-up                              |
| order-service crashes after reserving | Reservation stays `RESERVED`                                                        | Compensating `ReleaseStock`, otherwise sweeper releases it after 15 min                    |
| `order.placed` arrives after expiry   | Reservation already released                                                        | Late commit re-acquires stock, or publishes `stock.reservation_failed` → order `CANCELLED` |
| Relay crash after publish/apply       | Duplicate delivery                                                                  | Idempotent consumers / markers                                                             |
| inventory DB write fails after Lua    | Redis ahead of PG                                                                   | Reserve: Lua compensation; commit: ledger reconciliation on redelivery                     |

## 9. Configuration and process roles

| Variable                                                                                  | Service      | Default                  | Purpose                                                 |
| ----------------------------------------------------------------------------------------- | ------------ | ------------------------ | ------------------------------------------------------- |
| `DATABASE_URL`                                                                            | both         | **required**             | PostgreSQL connection (fail fast + `SELECT 1` probe)    |
| `REDIS_URL`                                                                               | both         | `redis://localhost:6379` | Redis                                                   |
| `KAFKA_BROKERS`                                                                           | both         | `localhost:9092`         | Redpanda                                                |
| `INVENTORY_GRPC_HOST` / `_PORT`                                                           | order / both | `localhost` / `50051`    | gRPC                                                    |
| `HTTP_ENABLED`                                                                            | both         | `true`                   | HTTP (and gRPC on inventory); `false` = worker-only pod |
| `OUTBOX_RELAY_ENABLED`, `OUTBOX_RELAY_INTERVAL_MS`                                        | both         | `true`, 1000             | Outbox relay                                            |
| `KAFKA_CONSUMERS_ENABLED`                                                                 | both         | `true`                   | Kafka consumers                                         |
| `RESERVATION_SWEEPER_ENABLED`, `RESERVATION_SWEEP_INTERVAL_MS`, `RESERVATION_TTL_SECONDS` | inventory    | `true`, 30000, 900       | Expiry                                                  |
| `STOCK_CACHE_WARMUP_ENABLED`                                                              | inventory    | `true`                   | Startup warm-up                                         |
| `SWAGGER_ENABLED`                                                                         | both         | `true`                   | `/api/docs`, `/api/docs-json`                           |

The same image can run as API pods (`OUTBOX_RELAY_ENABLED=false`, `KAFKA_CONSUMERS_ENABLED=false`) or worker
pods (`HTTP_ENABLED=false`). Images are multi-stage (`build` → `migrate` → `runtime`), non-root, with health checks.

## 10. Known limitations and next steps

| Area             | Limitation                                                                                  | Direction                                                   |
| ---------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Security         | No authentication; `GET /orders?customerId=` exposes any customer's orders; restock is open | API gateway / BFF with JWT, scope orders to the caller      |
| Pricing          | `unitPrice` and `productName` come from the client                                          | Catalog / pricing service                                   |
| Payment          | `confirm()` exists but nothing triggers it                                                  | Payment service + saga                                      |
| Cancellation     | `order.cancelled` is not consumed by inventory                                              | Release committed / reserved stock on customer cancellation |
| Late events      | A late `order.placed` with stock gone cancels the order after acceptance                    | Notify the customer; extend reservation TTL                 |
| Redis total loss | Active reservations are lost; their `reserved` units stay counted                           | Rebuild reservations from the ledger                        |
| Redis Cluster    | Scripts touch several keys                                                                  | Hash tags per SKU / reservation                             |
| Outbox markers   | `applied_restock` markers expire after 30 days                                              | Alert on outbox rows pending longer than minutes            |

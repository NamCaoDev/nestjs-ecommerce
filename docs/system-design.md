# System Design — NestJS E-commerce (Order, Inventory & Payment)

> Status: reflects the code on branch `feat/payment-service`.
> Per-feature message flows live in [`message-flows/`](./message-flows/README.md).

## 1. Scope and goals

The system takes customer orders, collects their payment through a gateway and guarantees that **stock is
never oversold** and **money is never lost or counted twice**, even under concurrent checkouts, crashes, retries,
duplicate webhooks and partial outages of Redis or Kafka.

| Goal                             | How it is achieved                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No overselling under concurrency | Stock checks and changes run as atomic Lua scripts on Redis (CLAUDE.md §3.1)                         |
| No lost or phantom events        | Transactional outbox in every service (CLAUDE.md §3.2)                                               |
| Safe retries                     | `Idempotency-Key` on state-changing requests, Redis `SET NX EX` + DB unique keys (§3.3)              |
| Service autonomy                 | Database per service, no cross-service joins or FKs, logical UUIDs and JSON snapshots (§3.4)         |
| Pay before shipping              | Saga choreography: stock is committed on `payment.succeeded`, released at once on `payment.failed`   |
| Tamper-proof money records       | Append-only payment ledger and activity log, enforced by PostgreSQL triggers; HMAC-verified webhooks |
| No stuck stock                   | Reservations expire (ZSET + sweeper) unless the order is paid and committed                          |
| Recoverable cache                | Redis counters are restored from PostgreSQL on demand and at startup                                 |

Out of scope today: customers/catalog services, authentication, shipping, notifications.

## 2. Bounded contexts

```mermaid
flowchart LR
  subgraph Ordering["Ordering context (order-service)"]
    O[Order aggregate<br/>OrderItem, Money, AddressSnapshot, OrderCode]
  end
  subgraph Inventory["Inventory context (inventory-service)"]
    S[InventoryStock<br/>StockReservation, RestockRequest]
  end
  subgraph Payment["Payment context (payment-service)"]
    P[Payment aggregate<br/>PaymentTransaction ledger, Money, OrderReference]
  end
  Customer([Customer / BFF]) -->|REST| Ordering
  Ordering -->|gRPC ReserveStock / ReleaseStock<br/>customer-supplier| Inventory
  Ordering -. "orders.events (order.placed)" .-> Payment
  Payment -. "payments.events (payment.succeeded / failed)" .-> Ordering
  Payment -. "payments.events (payment.succeeded / failed)" .-> Inventory
  Inventory -. "inventory.events (stock.reservation_failed)" .-> Ordering
  Gateway([Payment gateway<br/>MOCK, VNPay, VietQR]) -->|signed webhook| Payment
  Payment -->|initiate / refund| Gateway
  Warehouse([Warehouse operator]) -->|REST restock| Inventory
```

| Relationship                           | Pattern                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Ordering → Inventory (reserve/release) | Synchronous customer–supplier over gRPC, contract in `libs/proto/inventory.proto`      |
| Ordering ⇄ Payment ⇄ Inventory         | Saga choreography over Kafka; published language `@org/contracts` (payloads, envelope) |
| Payment → gateways                     | Anticorruption layer: one adapter per provider behind `PaymentGatewayPort` (strategy)  |
| Shared kernel                          | `@org/shared-domain` (ValueObject, Entity, AggregateRoot, Result, DomainError)         |

## 3. C4 model

### 3.1 Level 1 — System context

```mermaid
flowchart TB
  customer(["<b>Customer</b><br/>[Person]<br/>Places, pays and tracks orders"]):::person
  operator(["<b>Warehouse operator</b><br/>[Person]<br/>Records goods received"]):::person
  agent(["<b>Customer care / finance</b><br/>[Person]<br/>Refunds, payment activity"]):::person
  bff["<b>Storefront / BFF</b><br/>[Software System, future]<br/>Authentication, aggregation"]:::external
  platform["<b>E-commerce platform</b><br/>[Software System]<br/>Orders, guaranteed stock reservation,<br/>payments with an append-only ledger"]:::system
  gateway["<b>Payment gateways</b><br/>[Software System]<br/>MOCK (built in), VNPay, VietQR VA"]:::external
  customer -- "Uses<br/>[HTTPS]" --> bff
  customer -- "Pays (redirect, QR code,<br/>bank transfer)" --> gateway
  bff -- "Places and queries orders<br/>[REST/JSON]" --> platform
  operator -- "Restocks SKUs<br/>[REST/JSON]" --> platform
  agent -- "Refunds, reads activity log<br/>[REST/JSON]" --> platform
  platform -- "Opens checkouts, refunds" --> gateway
  gateway -- "Signed webhooks<br/>[HTTPS]" --> platform
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
```

### 3.2 Level 2 — Containers

```mermaid
flowchart TB
  customer(["<b>Customer / BFF</b><br/>[Person]"]):::person
  operator(["<b>Warehouse operator</b><br/>[Person]"]):::person
  gateway["<b>Payment gateway</b><br/>[Software System]"]:::external
  subgraph platform["E-commerce platform [Software System]"]
    order["<b>order-service</b><br/>[Container: NestJS]<br/>Orders API, outbox relay,<br/>inventory + payments consumers"]:::container
    inventory["<b>inventory-service</b><br/>[Container: NestJS]<br/>gRPC reservations, stock API,<br/>payments consumer, sweeper"]:::container
    payment["<b>payment-service</b><br/>[Container: NestJS]<br/>Webhooks, refunds, activity log,<br/>orders consumer, outbox relay"]:::container
    kafka[["<b>Redpanda</b><br/>[Container: Kafka API]<br/>orders / inventory / payments.events"]]:::container
    redis[("<b>Redis 7.2</b><br/>[Container]<br/>Idempotency keys, stock,<br/>reservations, expiry queue")]:::container
    orderDb[("<b>order_db</b><br/>[PostgreSQL 16]")]:::container
    inventoryDb[("<b>inventory_db</b><br/>[PostgreSQL 16]")]:::container
    paymentDb[("<b>payment_db</b><br/>[PostgreSQL 16]<br/>append-only ledger + audit")]:::container
  end
  customer -- "REST /api/orders" --> order
  operator -- "REST restock" --> inventory
  payment <-- "initiate, refund /<br/>signed webhooks" --> gateway
  order -- "gRPC :50051" --> inventory
  order <-- "Kafka" --> kafka
  inventory <-- "Kafka" --> kafka
  payment <-- "Kafka" --> kafka
  order --> orderDb
  order -- "SET NX EX" --> redis
  inventory -- "Lua" --> redis
  inventory --> inventoryDb
  payment --> paymentDb
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
  class platform boundary
```

| Container          | Inbound                                                            | Outbound                                           | Ports (local)                              |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------ |
| order-service      | REST `/api/orders`, `inventory.events`, `payments.events`          | gRPC → inventory, `orders.events`, order_db, Redis | HTTP 3100 (debug 9229)                     |
| inventory-service  | gRPC `InventoryService`, REST `/api/inventory`, `payments.events`  | `inventory.events`, inventory_db, Redis            | HTTP 3200, gRPC 50051 (debug 9230)         |
| payment-service    | REST `/api/payments` (webhooks, refunds, queries), `orders.events` | gateways, `payments.events`, payment_db            | HTTP 3300 (debug 9231)                     |
| PostgreSQL         | —                                                                  | —                                                  | 5433 (host), 5432 (compose network)        |
| Redis              | —                                                                  | —                                                  | 6379                                       |
| Redpanda / Console | —                                                                  | —                                                  | 9092 (host), 29092 (compose), Console 8088 |

Every HTTP service serves Swagger at `/api/docs` and `/api/docs-json` (`SWAGGER_ENABLED`).

### 3.3 Level 3 — Components of order-service

```mermaid
flowchart TB
  subgraph svc["order-service [Container]"]
    direction TB
    subgraph presentation["Presentation"]
      direction LR
      ctrl["<b>OrderController</b><br/>[Component: REST]<br/>POST /orders, GET /orders, GET /orders/:id"]:::component
      consumer["<b>InventoryEventsConsumer<br/>PaymentEventsConsumer</b><br/>[Component: Kafka]<br/>stock.reservation_failed → CancelOrder<br/>payment.succeeded → ConfirmOrder<br/>payment.failed → CancelOrder"]:::component
      relay["<b>OutboxRelayService</b><br/>[Component: worker]<br/>every 1 s → RelayOutbox"]:::component
    end
    handlers["<b>Command and query handlers</b><br/>[Component: Application / CQRS]<br/>CreateOrder, ConfirmOrder, CancelOrder, RelayOutbox,<br/>GetOrderById, GetOrdersByCustomer"]:::component
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
      consumer["<b>PaymentEventsConsumer</b><br/>[Component: Kafka]<br/>payment.succeeded → CommitStock<br/>payment.failed → ReleaseOrderStock"]:::component
      workers["<b>Workers</b><br/>[Component]<br/>ReservationSweeper 30 s, InventoryOutboxRelay 1 s,<br/>StockCacheWarmup at startup"]:::component
    end
    handlers["<b>Command and query handlers</b><br/>[Component: Application / CQRS]<br/>Reserve, Release, ReleaseOrderStock, Commit, Restock,<br/>ReleaseExpired, RelayInventoryOutbox, WarmUp, GetStockBySku, GetStockLedger"]:::component
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

### 3.5 Level 3 — Components of payment-service

```mermaid
flowchart TB
  subgraph svc["payment-service [Container]"]
    direction TB
    subgraph presentation["Presentation"]
      direction LR
      ctrl["<b>PaymentController</b><br/>[Component: REST]<br/>POST webhook/:gateway, POST :id/refunds,<br/>GET orders/:orderId, GET :id/activities"]:::component
      mock["<b>MockGatewayController</b><br/>[Component: REST, dev only]<br/>POST mock-gateway/pay"]:::component
      consumer["<b>OrderEventsConsumer</b><br/>[Component: Kafka]<br/>order.placed → InitiatePayment"]:::component
      relay["<b>OutboxRelayService</b><br/>[Component: AbstractPollingWorker]<br/>every 1 s → payments.events"]:::component
    end
    handlers["<b>Command and query handlers</b><br/>[Component: Application / CQRS]<br/>InitiatePayment, ProcessWebhook, RefundPayment,<br/>SimulateGatewayPayment, RelayOutbox,<br/>GetPaymentByOrderId, GetPaymentActivities"]:::component
    audit["<b>PaymentDomainEventAuditor<br/>PaymentAuditService</b><br/>[Component: Application]<br/>domain events → activity rows;<br/>signature / payload rejections"]:::component
    domain["<b>Payment aggregate<br/>PaymentTransaction entity</b><br/>[Component: Domain, pure TS]<br/>ledger invariants, domain events"]:::component
    subgraph infrastructure["Infrastructure adapters"]
      direction LR
      registry["<b>PaymentGatewayRegistry</b><br/>[Component]<br/>MOCK, VNPay, VietQR VA adapters"]:::component
      repo["<b>PaymentPrismaRepository<br/>PaymentReadPrismaRepository<br/>AuditLogPrismaRepository</b><br/>[Component]<br/>payment + ledger + audit + outbox in one TX"]:::component
      pub["<b>KafkaEventPublisher</b><br/>[Component]<br/>payments.events"]:::component
    end
  end
  gateway["<b>Payment gateways</b><br/>[Software System]"]:::external
  paymentDb[("<b>payment_db</b><br/>[Container: PostgreSQL]")]:::container
  kafka[["<b>Redpanda</b><br/>[Container]"]]:::container
  ctrl -- "CommandBus / QueryBus" --> handlers
  mock -- "CommandBus" --> handlers
  consumer -- "CommandBus" --> handlers
  relay -- "CommandBus" --> handlers
  handlers -- "initiateCharge / applyTransactionResult /<br/>applyRefund" --> domain
  handlers -- "audit entries" --> audit
  handlers -- "PaymentGatewayRegistryPort" --> registry
  handlers -- "PaymentRepositoryPort, PaymentReadPort,<br/>AuditLogPort, OutboxEventRepositoryPort" --> repo
  handlers -- "EventPublisherPort" --> pub
  registry -- "HTTPS" --> gateway
  repo -- "SQL" --> paymentDb
  pub -- "Kafka" --> kafka
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#999999,stroke:#6b6b6b,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef boundary fill:#ffffff,stroke:#444,stroke-dasharray:5 5,color:#000
  class svc boundary
```

### 3.6 Code structure (per service)

```
apps/<service>/src
├── domain/           pure TypeScript: aggregates, value objects, domain events, errors, repository ports
├── application/      CQRS commands/queries + handlers, outbound ports, read models
├── infrastructure/   Prisma, Redis (Lua), gRPC client, Kafka, payment gateway adapters
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

## 4. End-to-end checkout flow (saga choreography)

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant O as order-service
  participant I as inventory-service
  participant K as Redpanda
  participant P as payment-service
  participant G as Gateway

  C->>O: POST /api/orders + Idempotency-Key
  O->>I: gRPC ReserveStock (atomic_reserve.lua, ledger RESERVED)
  I-->>O: success
  O->>O: TX: order PENDING + outbox(order.placed)
  O-->>C: 201 { orderId }
  O->>K: orders.events ← order.placed (outbox relay)
  K->>P: order.placed
  P->>G: initiate (QR code / redirect / virtual account)
  P->>P: TX: payment PENDING + CHARGE PENDING + audit PAYMENT_INITIATED
  C->>G: pays
  G->>P: POST /api/payments/webhook/:gateway (signed)
  P->>P: verify signature → TX: CHARGE SUCCESS, payment PAID,<br/>audit rows, outbox(payment.succeeded)
  P->>K: payments.events ← payment.succeeded (outbox relay)
  par order-service
    K->>O: payment.succeeded → order CONFIRMED (+ order.confirmed)
  and inventory-service
    K->>I: payment.succeeded → atomic_commit.lua, ledger COMMITTED
  end
```

On `payment.failed` the order is `CANCELLED` and the inventory runs `atomic_release.lua` at once (ledger
`RELEASED`) instead of waiting for the reservation to expire. Details: [message flows 08–11](./message-flows/README.md).

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

### 5.3 payment_db

```mermaid
erDiagram
  payments ||--o{ payment_transactions : ledger
  payments ||--o{ payment_audit_logs : activity
  payment_transactions ||--o{ payment_audit_logs : about
  payments {
    uuid id PK
    uuid order_id UK "logical ref, no FK"
    uuid customer_id "logical ref, no FK"
    decimal total_amount "CHECK > 0; never changes"
    decimal refunded_amount "CHECK 0 <= refunded <= total"
    varchar currency
    payment_status status "PENDING | PAID | PARTIALLY_REFUNDED | REFUNDED | FAILED"
    json line_items "snapshot [{skuId, quantity}] for the inventory"
    int version "optimistic locking"
  }
  payment_transactions {
    uuid id PK "merchant reference sent to the gateway"
    uuid payment_id FK
    transaction_type type "CHARGE | REFUND"
    payment_gateway_provider gateway "VNPAY | VIETQR_VA | MOMO | ZALOPAY | STRIPE | MOCK"
    payment_channel channel "QR_CODE | DOMESTIC_BANK | INTERNATIONAL_CARD | BANK_TRANSFER"
    varchar gateway_tx_id "indexed"
    decimal amount "CHECK > 0"
    transaction_status status "PENDING | SUCCESS | FAILED | CANCELLED"
    varchar failure_reason
    varchar idempotency_key UK
    json raw_gateway_response "client action, webhook or refund payload"
  }
  payment_audit_logs {
    uuid id PK
    uuid payment_id FK
    uuid transaction_id FK "nullable"
    varchar action "PAYMENT_INITIATED, TRANSACTION_FINALIZED, STATE_CHANGED, WEBHOOK_*"
    payment_actor_type actor_type "SYSTEM | GATEWAY | CUSTOMER | ADMIN"
    varchar actor_id
    varchar state_from
    varchar state_to
    json payload "sanitised: secrets and signatures masked"
    varchar ip_address
  }
  outbox_events {
    uuid id PK
    uuid aggregate_id "payment id"
    varchar event_type "payment.succeeded | payment.failed"
    json payload
    outbox_status status
    timestamptz locked_until
  }
```

`payment_transactions` has no `updated_at`: a row is inserted, and a PENDING row is finalised once. Triggers enforce
it (§7.5). Ledger keys: `charge:{order.placed event id}` and `refund:{paymentId}:{Idempotency-Key}`.

### 5.4 Redis keys

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

| Topic              | Key       | Partitions | Producer                             | Consumer groups                                                    | Events                                               |
| ------------------ | --------- | ---------- | ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `orders.events`    | `orderId` | 3          | order-service (outbox relay)         | `payment-consumer-group`                                           | `order.placed`, `order.confirmed`, `order.cancelled` |
| `payments.events`  | `orderId` | 3          | payment-service (outbox relay)       | `order-payment-consumer-group`, `inventory-payment-consumer-group` | `payment.succeeded`, `payment.failed`                |
| `inventory.events` | `orderId` | 3          | inventory-service (direct, see §7.4) | `order-consumer-group`                                             | `stock.reservation_failed`                           |

A service consuming two topics uses one group per topic: the members of a group must subscribe to the same
topics. `payment.succeeded` / `payment.failed` carry the order lines (`items`), so the inventory can still commit
or release when the reservation has expired.

Every message value is an `IntegrationEventEnvelope` `{ eventId, eventType, aggregateId, occurredAt, payload }`
(`libs/contracts`). Producers are idempotent with one in-flight request, `acks=all`, Snappy compression.
Consumers never auto-create topics; both sides create them with the configured partition count.

Internal (non-Kafka) events: `stock.restocked` lives only in the inventory outbox and is applied to Redis. Payment
domain events (`payment.initiated`, `payment.transaction_finalized`, `payment.status_changed`) feed the activity log;
only transitions to PAID / FAILED reach the outbox. Refunds are not published yet.

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
| `order.placed` consumption       | payment-service: `payments.order_id` UNIQUE + ledger key `charge:{eventId}`                  |
| `payment.succeeded` consumption  | inventory: `COMMITTED` marker in Redis + partial unique index; order: already `CONFIRMED`    |
| `payment.failed` consumption     | inventory: release only acts while `RESERVED`; order: already `CANCELLED`                    |
| Gateway webhook                  | A final charge acknowledges retries with 200; concurrent deliveries → version conflict (409) |
| `POST /payments/:id/refunds`     | Ledger key `refund:{paymentId}:{Idempotency-Key}`: a replay returns the recorded refund      |
| `POST /inventory/stocks/restock` | `stock_ledger.idempotency_key` UNIQUE → 409                                                  |
| `stock.restocked` apply          | `inventory:applied_restock:{eventId}` marker, atomic with `HINCRBY`                          |

### 7.4 Deliberate exceptions

- `stock.reservation_failed` is published directly (not via an outbox): the inventory path that emits it changes
  no local state, and a failed publish makes the consumer rethrow so Kafka redelivers `order.placed`.
- The payment gateway is called before the payment is stored (to get the customer action); if the store fails the
  checkout session at the gateway simply expires unused.
- Order creation calls inventory synchronously (gRPC) to give the customer an immediate answer; compensation
  (`ReleaseStock`) runs if persisting the order fails, except on a duplicate key (the reservation then belongs
  to the order already stored).

### 7.5 Append-only payment ledger and activity log

| Guarantee                                                | Domain (`Payment`, `PaymentTransaction`)              | Database (triggers / CHECK, init migration)                                  |
| -------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| A final entry (SUCCESS, FAILED, CANCELLED) never changes | `finalize` throws `TransactionAlreadyFinalizedError`  | `payment_transactions_guard`: UPDATE / DELETE of a final row raises          |
| A PENDING entry only gets its outcome                    | No setters; `finalize` once                           | Same trigger: id, payment, type, gateway, amount, key, created_at are frozen |
| The activity log is never changed                        | Rows are only appended                                | `payment_audit_logs_guard`: every UPDATE / DELETE raises                     |
| No bulk wipe                                             | —                                                     | `BEFORE TRUNCATE` triggers on both tables                                    |
| `totalAmount` never changes; refunds never exceed it     | `applyRefund` / `checkRefund` invariants              | `payments_refunded_amount_range` CHECK                                       |
| A success captures exactly the charged amount            | `AmountMismatchError` (audited as `WEBHOOK_REJECTED`) | —                                                                            |

The repository inserts new ledger rows and finalises PENDING rows with `UPDATE … WHERE status = 'PENDING'`; payment
row, ledger rows, activity rows and outbox rows are written in one `$transaction`. Activity rows come from the domain
events through synchronous audit handlers, so they commit or roll back with the change they describe. Protocol
events that change nothing (bad signature, malformed payload, gateway refusal) are appended by `PaymentAuditService`
with the caller IP and sanitised request metadata.

### 7.6 Payment gateways (strategy)

| Adapter                  | Customer action                    | Webhook verification                                            | Refund / status query                         |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `MockGatewayAdapter`     | QR code, redirect, virtual account | HMAC-SHA256 of the raw body, `x-webhook-signature`              | Instant (reason `MOCK_REFUND_DECLINED` fails) |
| `VnpayGatewayAdapter`    | Redirect, signed `vnp_Command=pay` | HMAC-SHA512 over sorted `vnp_` params; 00 success, 24 cancelled | Skeleton: signed refund prepared, 501         |
| `VietqrVaGatewayAdapter` | Virtual account                    | HMAC-SHA256 of the raw body, `x-vietqr-signature`               | Not supported (manual), 501                   |

Signatures are compared in constant time (`timingSafeEqual`). The webhook route keeps the raw body (`rawBody: true`)
because signatures cover the exact bytes; for IPNs without a body (VNPay) the query string is verified instead.

## 8. Failure modes

| Failure                                       | Effect                                                                              | Recovery                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Kafka down                                    | Orders still accepted; outbox rows stay `PENDING`, `retry_count` grows              | Relay publishes in order once Kafka is back                                                              |
| Redis down                                    | `POST /orders` fails (idempotency + reservation need Redis); restock still succeeds | Inventory outbox relay applies receipts once Redis is back                                               |
| Redis data loss                               | Stock hashes missing                                                                | `STOCK_NOT_LOADED` → restore from PG + retry; startup warm-up                                            |
| order-service crashes after reserving         | Reservation stays `RESERVED`                                                        | Compensating `ReleaseStock`, otherwise sweeper releases it after 15 min                                  |
| Payment arrives after the reservation expired | Reservation already released                                                        | Late commit re-acquires stock, or `stock.reservation_failed` (order may already be `CONFIRMED`, see §10) |
| Webhook arrives before the payment exists     | `order.placed` not consumed yet                                                     | 404; the gateway retries                                                                                 |
| Duplicate / concurrent webhooks               | Same result delivered twice                                                         | Final charge → 200 unchanged; concurrent → 409, retry acknowledged                                       |
| Forged or altered webhook                     | Signature mismatch                                                                  | 401 + `WEBHOOK_SIGNATURE_MISMATCH` in the activity log                                                   |
| Relay crash after publish/apply               | Duplicate delivery                                                                  | Idempotent consumers / markers                                                                           |
| inventory DB write fails after Lua            | Redis ahead of PG                                                                   | Reserve: Lua compensation; commit: ledger reconciliation on redelivery                                   |

## 9. Configuration and process roles

| Variable                                                                                   | Service      | Default                  | Purpose                                                    |
| ------------------------------------------------------------------------------------------ | ------------ | ------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`                                                                             | all          | **required**             | PostgreSQL connection (fail fast + `SELECT 1` probe)       |
| `REDIS_URL`                                                                                | order, inv.  | `redis://localhost:6379` | Redis                                                      |
| `KAFKA_BROKERS`                                                                            | all          | `localhost:9092`         | Redpanda                                                   |
| `INVENTORY_GRPC_HOST` / `_PORT`                                                            | order / inv. | `localhost` / `50051`    | gRPC                                                       |
| `HTTP_ENABLED`                                                                             | all          | `true`                   | HTTP (and gRPC on inventory); `false` = worker-only pod    |
| `OUTBOX_RELAY_ENABLED`, `OUTBOX_RELAY_INTERVAL_MS`                                         | all          | `true`, 1000             | Outbox relay                                               |
| `KAFKA_CONSUMERS_ENABLED`                                                                  | all          | `true`                   | Kafka consumers                                            |
| `RESERVATION_SWEEPER_ENABLED`, `RESERVATION_SWEEP_INTERVAL_MS`, `RESERVATION_TTL_SECONDS`  | inventory    | `true`, 30000, 900       | Expiry                                                     |
| `STOCK_CACHE_WARMUP_ENABLED`                                                               | inventory    | `true`                   | Startup warm-up                                            |
| `PAYMENT_DEFAULT_GATEWAY`, `PAYMENT_DEFAULT_CHANNEL`                                       | payment      | `MOCK`, `QR_CODE`        | Gateway and channel of new payments                        |
| `MOCK_GATEWAY_SECRET`, `MOCK_GATEWAY_BASE_URL`                                             | payment      | required when used       | MOCK webhook HMAC secret, checkout URLs                    |
| `MOCK_GATEWAY_ENABLED`                                                                     | payment      | `true`                   | `POST /payments/mock-gateway/pay`; **false in production** |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `VNPAY_PAYMENT_URL`             | payment      | required when used       | VNPay adapter                                              |
| `VIETQR_WEBHOOK_SECRET`, `VIETQR_BANK_BIN`, `VIETQR_ACCOUNT_PREFIX`, `VIETQR_ACCOUNT_NAME` | payment      | required when used       | VietQR virtual-account adapter                             |
| `SWAGGER_ENABLED`                                                                          | all          | `true`                   | `/api/docs`, `/api/docs-json`                              |

The same image can run as API pods (`OUTBOX_RELAY_ENABLED=false`, `KAFKA_CONSUMERS_ENABLED=false`) or worker
pods (`HTTP_ENABLED=false`). Images are multi-stage (`build` → `migrate` → `runtime`), non-root, with health checks.

## 10. Known limitations and next steps

| Area             | Limitation                                                                                  | Direction                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Security         | No authentication; `GET /orders?customerId=` and refunds are open (`x-actor-id` is trusted) | API gateway / BFF with JWT, roles for refunds                |
| Pricing          | `unitPrice` and `productName` come from the client                                          | Catalog / pricing service                                    |
| Late payments    | A payment after the 15-min reservation may be confirmed while stock is gone                 | Refund saga on `stock.reservation_failed`; expire checkouts  |
| Refund events    | Refunds are audited but not published; stock is not restocked on refund                     | `payment.refunded` event, returns flow                       |
| Gateways         | VNPay refund / `querydr` client and IPN `RspCode` reply not wired; VietQR has no refunds    | Merchant web API clients; reconciliation job (`queryStatus`) |
| Unattached audit | A forged webhook naming no known charge is only logged (every row belongs to a payment)     | Separate security log                                        |
| Cancellation     | `order.cancelled` is not consumed by inventory                                              | Release committed / reserved stock on customer cancellation  |
| Redis total loss | Active reservations are lost; their `reserved` units stay counted                           | Rebuild reservations from the ledger                         |
| Redis Cluster    | Scripts touch several keys                                                                  | Hash tags per SKU / reservation                              |
| Outbox markers   | `applied_restock` markers expire after 30 days                                              | Alert on outbox rows pending longer than minutes             |

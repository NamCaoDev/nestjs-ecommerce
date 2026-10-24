# High-Concurrency E-Commerce Microservices Workspace

## 1. System Architecture & Tech Stack

- **Architecture**: Domain-Driven Design (DDD), Clean Architecture (Hexagonal / Ports & Adapters), Event-Driven Architecture (EDA).
- **Workspace**: Nx Monorepo (`apps/` for deployable services, `libs/` for shared libraries, contracts, and proto files).
- **Framework & Runtime**: Node.js, NestJS (Strict TypeScript mode enabled).
- **Internal Service Communication**: gRPC via `@grpc/grpc-js` and Protocol Buffers.
- **External Client Communication**: RESTful JSON via API Gateway / BFF.
- **Event Streaming**: Redpanda / Apache Kafka via `kafkajs`.
- **Primary Persistence**: Database-per-service via PostgreSQL 16 with Prisma ORM.
- **Caching & Atomic Concurrency**: Redis 7.2 (`ioredis`) running atomic Lua scripts.

---

## 2. Layered Architecture & Boundary Rules

Every microservice inside `apps/*` strictly adheres to four concentric layers. Dependencies flow exclusively inward: `Presentation -> Infrastructure -> Application -> Domain`.

### A. Domain Layer (`src/domain/`) - The Pure Core
- **Zero Framework Footprint**: Absolutely NO imports from `@nestjs/*`, `@prisma/*`, or external runtime libraries. Pure TypeScript only.
- **Aggregate Roots & Entities**:
    - Encapsulate all business rules and invariants internally.
    - State mutations must occur via explicit domain methods (e.g., `order.confirm()`, `order.cancel(reason)`). Direct public property setters are forbidden.
    - Must extend pure TypeScript base classes from `@libs/shared/domain` (DO NOT import `AggregateRoot` from `@nestjs/cqrs`).
- **Value Objects**:
    - Immutable objects without identity.
    - Constructors must be `private`. Provide static factory methods (e.g., `Email.create()`, `Money.create()`) that validate invariants.
    - Implement an `equals(other: ValueObject): boolean` method for structural comparison.
- **Domain Events**:
    - Capture critical state transitions (e.g., `OrderPlacedEvent`).
    - Recorded inside the aggregate root via `this.addDomainEvent()` and collected/cleared by the repository during persistence.
- **Repository Ports**:
    - Defined purely as interfaces in `domain/repositories/` (e.g., `OrderRepositoryPort`).
    - Pair each port with an exported `Symbol` token for Dependency Injection:
      ```typescript
      export const ORDER_REPOSITORY_PORT = Symbol('ORDER_REPOSITORY_PORT');
      ```

### B. Application Layer (`src/application/`) - Orchestration & Use Cases
- Orchestrates business workflows using the CQRS pattern (Commands and Queries).
- Manages cross-cutting concerns: distributed locks, idempotency checks, and transaction boundaries.
- Depends only on the Domain Layer and outgoing port abstractions.
- Defines outbound ports (e.g., `InventoryRpcPort`, `EventPublisherPort`) for infrastructure adapters.
- Keeps Use Case classes focused on a single responsibility with an `execute()` method.

### C. Infrastructure Layer (`src/infrastructure/`) - Concrete Adapters
- Implements Repository Ports using Prisma (`OrderPrismaRepository`). Maps ORM schemas to Domain Models bidirectionally.
- Houses Redis Lua scripts, distributed locks, and caching strategies.
- Implements Kafka message producers/consumers and Outbox polling relay workers.
- Implements outbound gRPC client adapters.

### D. Presentation Layer (`src/presentation/`) - Inbound Delivery
- Houses NestJS Controllers for REST routes, `@GrpcMethod()` implementations, and Kafka `@EventPattern()` handlers.
- Validates external input payloads using DTOs backed by `class-validator` and `class-transformer`.
- Converts Domain Exceptions to HTTP or gRPC status codes using NestJS Exception Filters.
- Exposes an `admin/test` smoke-test endpoint on each primary controller.

---

## 3. High-Concurrency & Data Integrity Directives

1. **Atomic Stock Deductions (Zero Database Locks)**:
    - NEVER execute `SELECT FOR UPDATE` on relational tables during high-traffic checkout.
    - All high-traffic stock reservations and deductions MUST be performed atomically on Redis using Lua scripts before persisting records.
2. **Transactional Outbox Pattern**:
    - Any state change that produces an external event must persist the aggregate state and the outbox message within the same local PostgreSQL transaction.
    - Dual-writing (e.g., writing to DB and directly dispatching to Kafka in the same function) is strictly forbidden.
3. **Idempotency Guarantee**:
    - All state-mutating requests must require an `Idempotency-Key` header.
    - Acquire locks and check processed keys using Redis `SET key value NX EX TTL`.
4. **Data Isolation & Snapshots**:
    - Zero cross-database joins or physical foreign keys connecting tables across different services.
    - Reference external domains by logical UUIDs only.
    - Persist point-in-time domain data (such as item unit prices, product titles, and recipient shipping addresses) as immutable JSON snapshots in the order record.

---

## 4. TypeScript & NestJS Clean Code Standards

### Basic Principles
- Use English for all code, types, comments, and documentation.
- Always declare explicit types for every variable, parameter, and function return value.
- Strictly avoid `any`. Use custom types, interfaces, or generics.
- Document all public classes, interfaces, and methods with JSDoc.
- **Do not leave blank lines within a function or method body.**
- **Enforce one export per file.**

### Nomenclature Conventions
- **Classes & Types**: `PascalCase` (e.g., `OrderAggregate`, `CreateOrderDto`).
- **Variables, Functions, Methods**: `camelCase` (e.g., `calculateTotal`, `orderRepository`).
- **Files & Directories**: `kebab-case` (e.g., `create-order.handler.ts`, `order-status.vo.ts`).
- **Environment Variables**: `UPPERCASE` with underscores (e.g., `KAFKA_BROKER_URL`).
- **Constants**: Define uppercase constants for non-obvious values; no magic numbers or hardcoded strings.
- **Function Naming**:
    - Always start with a verb.
    - Boolean returns: Prefix with `is`, `has`, `can` (e.g., `isValid()`, `hasStock()`).
    - Action execution: Prefix with `execute`, `save`, `dispatch` (e.g., `executeCheckout()`, `saveOrder()`).
- **Boolean Variables**: Always prefix with verbs (e.g., `isLoading`, `hasError`, `canProcess`).
- **Abbreviations**: Use complete, properly spelled words. Exceptions:
    - Standard tech acronyms: `API`, `URL`, `DTO`, `UUID`, `RPC`, `JSON`.
    - Scoped identifiers: `i`, `j` for loop indices; `err` for errors; `ctx` for execution contexts; `req`, `res`, `next` for HTTP middleware.

### Functions & Methods
- Write single-purpose functions containing fewer than 20 instructions.
- Avoid nested code blocks: use guard clauses, early returns, and sub-routine extraction.
- Prefer higher-order array methods (`map`, `filter`, `reduce`) over imperative loops.
- Use arrow functions for short logic (< 3 instructions); use named functions or methods otherwise.
- Use default parameter values instead of manual `null` or `undefined` guards.
- **Apply the RO-RO pattern (Receive an Object, Return an Object)** for functions taking multiple parameters or returning structured data:
    - Always declare dedicated input and output types/interfaces.
- Maintain a single level of abstraction within each function.

### Data & Immutability
- Avoid primitive obsession: encapsulate domain primitives in composite types or Value Objects.
- Push validation inside self-validating classes or Value Objects instead of procedural checks.
- Enforce immutability: use `readonly` for class properties and `as const` for literal structures.

### Classes
- Strictly adhere to SOLID principles and prefer composition over inheritance.
- Always define interfaces to decouple dependencies (Ports & Adapters).
- Maintain small, single-purpose classes:
    - Fewer than 200 instructions.
    - Fewer than 10 public methods.
    - Fewer than 10 properties.

### Exception Handling
- Throw custom Domain Exceptions for invariant violations (e.g., `InvalidOrderStateException`).
- Catch exceptions only to resolve an expected problem or attach domain context; otherwise, delegate to global filters.

### NestJS Dependency Injection & Modules
- Use Symbol-based injection tokens for all repository and service ports:
    - Definition: `export const ORDER_REPOSITORY_PORT = Symbol('ORDER_REPOSITORY_PORT');`
    - Injection: `constructor(@Inject(ORDER_REPOSITORY_PORT) private readonly repo: OrderRepositoryPort) {}`
    - Module binding: `{ provide: ORDER_REPOSITORY_PORT, useClass: OrderPrismaRepository }`
- Keep modules clean: one module per bounded context/route.
- Group common NestJS artifacts into a `CoreModule` (global filters, interceptors, guards).
- Shared cross-service primitives reside in `libs/shared/`.

---

## 5. Testing Strategy

- **Framework**: Jest.
- **Pure Domain Tests**:
    - Unit-test Aggregates, Entities, and Value Objects directly without instantiating `Test.createTestingModule`.
    - Test invariants, state machine transitions, and domain event emissions.
- **Application & Infrastructure Tests**:
    - Follow the **Arrange-Act-Assert (AAA)** convention.
    - Prefix variable names clearly: `inputX`, `mockX`, `actualX`, `expectedX`.
    - Mock external dependencies using Jest test doubles.
- **E2E & Integration Tests**:
    - Structure acceptance scenarios using the **Given-When-Then** format.
    - Verify complete horizontal flows: REST/gRPC trigger -> Application Use Case -> PostgreSQL Transaction + Outbox event persistence.

---

## 6. Monorepo Structure & Standard CLI Commands

### Directory Layout
```text
.
├── apps/
│   ├── api-gateway/            # REST BFF, Auth Verification, Rate Limiting
│   ├── order-service/          # Order Processing, State Machine, Outbox
│   ├── inventory-service/      # Stock Management, Redis Lua Scripts, Ledger
│   ├── customer-service/       # Customer Profiles, Address Book, Loyalty
│   └── payment-service/        # Payment Gateways, Webhook Idempotency
├── libs/
│   ├── shared/
│   │   ├── domain/             # Base AggregateRoot, Entity, ValueObject, Result
│   │   ├── infrastructure/     # Prisma common clients, Redis helper, Outbox relay
│   │   └── common-dto/         # Common HTTP responses, Error codes
│   ├── proto/                  # Centralized Protocol Buffer definitions (.proto)
│   └── contracts/              # Kafka Event schemas and TypeScript contracts
├── tools/                      # Docker assets, migration scripts
├── docker-compose.yml          # Local infra (Postgres, Redis, Redpanda)
└── package.json
```
## 7. Tactical DDD Patterns & Clean Architecture Implementation

### A. Value Objects Pattern

**Enforce validation and immutability at construction:**

- Declare a `private constructor(...)`.
- Expose a `public static create(...)` factory method validating invariants.
- Implement a `public equals(other: ValueObject): boolean` method for comparison.
- Do not provide public setters.

### B. Entity & Aggregate Root Pattern

**Entities possess identity and manage lifecycle state. Aggregates guard consistency boundaries:**

- Entities possess identity (`id`) and manage lifecycle state.
- Mutate collections via methods (`addItem()`, `removeItem()`), never direct array manipulation.
- Extend exclusively from `@libs/shared/domain/AggregateRoot` (**DO NOT** import from `@nestjs/cqrs`).
- Emit domain events internally using `this.addDomainEvent(new Event(...))`.

### C. Port & Adapter Dependency Injection (Hexagonal Rules)

**Ports reside in the Domain or Application layer as pure TypeScript interfaces.**

- Always declare a companion `Symbol` token in the port file to avoid DI string collision.

**Example — Port Definition:**

```typescript
// domain/repositories/order-repository.port.ts
export interface OrderRepositoryPort {
  save(order: OrderAggregate): Promise<void>;
  findById(id: string): Promise<OrderAggregate | null>;
}

export const ORDER_REPOSITORY_PORT = Symbol('ORDER_REPOSITORY_PORT');
```

**Example — Inject Port into Use Case:**

```typescript
// application/use-cases/create-order.use-case.ts
constructor(
  @Inject(ORDER_REPOSITORY_PORT)
  private readonly orderRepository: OrderRepositoryPort,
) {}
```

**Example — Wire Adapter in NestJS Module:**

```typescript
// order.module.ts
providers: [
  CreateOrderUseCase,
  {
    provide: ORDER_REPOSITORY_PORT,
    useClass: OrderPrismaRepository,
  },
]
```

### D. Layer-Specific Validation Boundaries

**Presentation Layer (Boundary Validation)**

- Validates input shape, data types, and required fields using DTOs with `class-validator` and `class-transformer`.

**Domain Layer (Business Invariant Validation)**

- Enforces business logic rules and domain constraints directly inside Value Objects and Aggregate methods.

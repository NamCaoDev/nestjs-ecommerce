# Microservices Workspace: Architecture & Clean Code Guidelines

## 1. System Architecture & Tech Stack

- **Architecture**: Domain-Driven Design (DDD), Clean Architecture (Hexagonal / Ports & Adapters), Event-Driven Architecture.
- **Workspace**: Nx Monorepo (`apps/` for microservices, `libs/` for shared libraries, contracts, and proto definitions).
- **Runtime & Framework**: Node.js, NestJS (Strict TypeScript).
- **Communication**: gRPC for internal service-to-service calls; REST for API Gateway / BFF endpoints; Apache Kafka / Redpanda for asynchronous domain events.
- **Persistence & Storage**: Database-per-service (PostgreSQL 16, Prisma ORM); Redis 7.2 with atomic Lua scripts for hot-path concurrency.

---

## 2. TypeScript Clean Code Guidelines

### Basic Principles

- Use English for all code, types, comments, and documentation.
- Always declare explicit types for every variable, parameter, and function return value.
- Strictly avoid `any`. Create explicit interfaces or types instead.
- Use JSDoc to document all public classes, interfaces, and methods.
- **Do not leave blank lines within a function or method body.**
- **One export per file.**

### Nomenclature

- **Classes & Types**: `PascalCase` (e.g., `OrderAggregate`, `CreateOrderDto`).
- **Variables, Functions, Methods**: `camelCase` (e.g., `calculateTotal`, `orderRepository`).
- **Files & Directories**: `kebab-case` (e.g., `create-order.handler.ts`, `order-status.vo.ts`).
- **Environment Variables**: `UPPERCASE` with underscores (e.g., `KAFKA_BROKER_URL`).
- **Constants**: Define constants for all non-obvious values; no magic numbers.
- **Function Naming**:
  - Always start with a verb.
  - Boolean return: prefix with `is`, `has`, `can` (e.g., `isValid()`, `hasStock()`, `canCancel()`).
  - Void / Action execution: prefix with `execute`, `save`, `dispatch` (e.g., `executeCheckout()`, `saveOrder()`).
- **Boolean Variables**: Always prefix with verbs (e.g., `isLoading`, `hasError`, `canDelete`).
- **Abbreviations**: Use complete, properly spelled words. Exceptions:
  - Standard tech acronyms: `API`, `URL`, `DTO`, `UUID`, `RPC`.
  - Scoped loop counters: `i`, `j`.
  - Scoped idioms: `err` for errors, `ctx` for contexts, `req`, `res`, `next` for HTTP handler parameters.

### Functions & Methods

- Write single-purpose functions under 20 instructions.
- Avoid nested blocks: use guard clauses, early returns, and extract sub-routines.
- Prefer higher-order functions (`map`, `filter`, `reduce`) over imperative loops.
- Use arrow functions for short logic (< 3 instructions); use named functions/methods otherwise.
- Use default parameter values instead of manual `null` or `undefined` guards.
- **Apply the RO-RO pattern (Receive an Object, Return an Object)** for functions taking multiple parameters or returning structured data:
  - Declare dedicated input and output types/interfaces.
- Maintain a single level of abstraction per function.

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

- Throw exceptions only for unexpected conditions or invariant violations.
- When catching an exception, do so only to resolve an expected problem or attach relevant domain context; otherwise, let the global filter handle it.

---

## 3. NestJS Architecture & Boundaries

### Clean Architecture Layers (Per Microservice in `apps/*`)

1. **Domain Layer (`src/domain/`)**:
   - Pure TypeScript only. **No imports from `@nestjs/*`, `@prisma/*`, or external frameworks.**
   - Contains Aggregates, Entities, Value Objects, Domain Events, and Repository Ports (interfaces).
   - Invariants must be enforced inside Aggregates. No public setters; state changes occur via domain methods.
2. **Application Layer (`src/application/`)**:
   - Contains CQRS Commands, Queries, Handlers, and Outbound Ports (RPC, Event Publisher).
   - Coordinates domain models, distributed locks, and idempotency logic.
3. **Infrastructure Layer (`src/infrastructure/`)**:
   - Implements Repository Ports using Prisma or Redis.
   - Hosts external integrations, gRPC client adapters, and Kafka producers/consumers.
4. **Presentation Layer (`src/presentation/`)**:
   - NestJS Controllers handling REST, gRPC endpoints, and Kafka message patterns.
   - Maps inputs to Application Commands and returns DTOs.

### NestJS Modular Structure

- **Domain Modules**: One module per core domain route/boundary.
- **Controllers**: One primary controller per route; secondary controllers for sub-resources. Include an `admin/test` smoke test endpoint on each controller.
- **DTOs**: Validate all input payloads with `class-validator` and `class-transformer`. Define simple immutable types for output responses.
- **Core Module (`src/core/`)**: Houses application-wide infrastructure:
  - Global exception filters for converting Domain Exceptions to HTTP/RPC errors.
  - Global logging and tracing interceptors.
  - Auth, Role, and Permission guards.
- **Shared Module (`libs/shared/`)**: Houses cross-cutting utilities, base domain abstractions, and shared contracts.

---

## 4. High-Concurrency & Data Integrity Rules

1. **Atomic Inventory Operations**:
   - Never use `SELECT FOR UPDATE` on relational tables during high-traffic checkout.
   - Execute stock checks and deductions atomically on Redis using Lua scripts before persisting records.
2. **Transactional Outbox Pattern**:
   - State mutations producing external events must persist the entity and outbox message in the same local database transaction.
   - Dual-writing directly to a database and message broker simultaneously is strictly prohibited.
3. **Idempotency**:
   - State-altering operations must require an `Idempotency-Key`.
   - Track and acquire locks with Redis `SET NX EX`.
4. **Zero Cross-Service DB Coupling**:
   - No cross-database joins or physical foreign keys between services.
   - Reference external domains by logical UUIDs and store immutable JSON snapshots for point-in-time data (e.g., shipping addresses, product pricing).

---

## 5. Testing Standards

- **Framework**: Jest.
- **Unit Tests**:
  - Write unit tests for every public function, service, and controller.
  - Follow the **Arrange-Act-Assert (AAA)** convention.
  - Name test variables clearly: `inputX`, `mockX`, `actualX`, `expectedX`.
  - Simulate dependencies using test doubles/mocks.
- **Acceptance & E2E Tests**:
  - Write acceptance tests for each module following the **Given-When-Then** convention.
  - Cover full vertical flows: request reception, command handling, and outbox persistence.

---

## 6. Standard Workspace Commands

- Build service: `npx nx build <service-name>`
- Test service: `npx nx test <service-name>`
- Run E2E tests: `npx nx e2e <service-name>-e2e`
- Run DB Migration: `npx nx run <service-name>:prisma-migrate`
- Lint & Typecheck: `npx nx run-many --target=lint --all`

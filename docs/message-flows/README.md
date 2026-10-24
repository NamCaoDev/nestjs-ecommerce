# Message flows

Each business feature has its own page. It contains the business narrative, a
[DDD Crew Domain Message Flow](https://github.com/ddd-crew/domain-message-flow-modelling) diagram, a
technical sequence diagram, and the rules and edge cases the code enforces.
Architecture, the C4 model and the data model are in [`../system-design.md`](../system-design.md).

Diagrams are SVG images rendered from Mermaid sources in [`diagrams/`](./diagrams/), one folder per page.
To change one, edit its `.mmd` file and run `tools/docs/render-diagrams.sh <file.mmd>`. With no argument,
the script re-renders every diagram.

| #                                   | Feature                                                                        | Trigger                           | Bounded contexts             |
| ----------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- | ---------------------------- |
| 01                                  | [Place order](./01-place-order.md)                                             | Customer checkout                 | Ordering → Inventory (gRPC)  |
| 02                                  | [Ship stock of a paid order](./02-commit-stock.md)                             | `payment.succeeded`               | Payment → Inventory (Kafka)  |
| 03                                  | [Cancel order when stock is gone](./03-cancel-order-on-reservation-failure.md) | `stock.reservation_failed`        | Inventory → Ordering (Kafka) |
| 04                                  | [Expire abandoned reservations](./04-reservation-expiry.md)                    | Time (sweeper)                    | Inventory                    |
| 05                                  | [Restock a SKU](./05-restock.md)                                               | Warehouse operator                | Inventory                    |
| 06                                  | [Recover the stock cache](./06-stock-cache-recovery.md)                        | Startup / missing Redis counters  | Inventory                    |
| 07                                  | [Query orders and stock](./07-queries.md)                                      | Customer / operator               | Ordering, Inventory          |
| 08                                  | [Open the payment of an order](./08-initiate-payment.md)                       | `order.placed`                    | event                        | order-service outbox     | payment-service                 | Kafka `orders.events` | `OrderPlacedPayload` |
| `order.confirmed`                   | event                                                                          | order-service outbox              | — (not consumed yet)         | Kafka `orders.events`    | `OrderConfirmedPayload`         |
| `order.cancelled`                   | event                                                                          | order-service outbox              | — (not consumed yet)         | Kafka `orders.events`    | `OrderCancelledPayload`         |
| `payment.succeeded`                 | event                                                                          | payment-service outbox            | order, inventory             | Kafka `payments.events`  | `PaymentSucceededPayload`       |
| `payment.failed`                    | event                                                                          | payment-service outbox            | order, inventory             | Kafka `payments.events`  | `PaymentFailedPayload`          |
| `stock.reservation_failed`          | event                                                                          | inventory-service                 | order-service                | Kafka `inventory.events` | `StockReservationFailedPayload` |
| Gateway webhook                     | event                                                                          | payment gateway                   | payment-service              | REST `webhook/:gateway`  | adapter-specific, signed        |
| `stock.restocked`                   | event (internal)                                                               | inventory outbox                  | inventory outbox relay       | PostgreSQL → Redis       | `StockRestockedPayload`         |
| `InitiatePaymentCommand`            | command                                                                        | OrderEventsConsumer (payment)     | InitiatePaymentHandler       | in-process               | —                               |
| `ProcessWebhookCommand`             | command                                                                        | PaymentController                 | ProcessWebhookHandler        | in-process               | —                               |
| `RefundPaymentCommand`              | command                                                                        | PaymentController                 | RefundPaymentHandler         | in-process               | —                               |
| `ConfirmOrderCommand`               | command                                                                        | PaymentEventsConsumer (order)     | ConfirmOrderHandler          | in-process               | —                               |
| `CancelOrderCommand`                | command                                                                        | Inventory / PaymentEventsConsumer | CancelOrderHandler           | in-process               | —                               |
| `CommitStockCommand`                | command                                                                        | PaymentEventsConsumer (inventory) | CommitStockHandler           | in-process               | —                               |
| `ReleaseOrderStockCommand`          | command                                                                        | PaymentEventsConsumer (inventory) | ReleaseOrderStockHandler     | in-process               | —                               |
| `ReleaseExpiredReservationsCommand` | command                                                                        | ReservationSweeperService         | handler                      | in-process               | —                               |
| `RestockSkuCommand`                 | command                                                                        | InventoryHttpController           | RestockSkuHandler            | in-process               | —                               |

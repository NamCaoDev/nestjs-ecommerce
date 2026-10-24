import { Command } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { CreateOrderCommandProps } from './create-order-command.props';
import { CreateOrderOutput } from './create-order.output';

/**
 * Command placing a new order. Handled by {@link CreateOrderHandler}; the type parameter lets
 * `CommandBus.execute` infer the result type.
 */
export class CreateOrderCommand extends Command<
  Result<CreateOrderOutput, Error>
> {
  public readonly idempotencyKey: string;
  public readonly customerId: string;
  public readonly currency: string;
  public readonly items: CreateOrderCommandProps['items'];
  public readonly shippingAddress: CreateOrderCommandProps['shippingAddress'];

  /**
   * @param props - Order data and the request Idempotency-Key.
   */
  public constructor(props: CreateOrderCommandProps) {
    super();
    this.idempotencyKey = props.idempotencyKey;
    this.customerId = props.customerId;
    this.currency = props.currency;
    this.items = props.items;
    this.shippingAddress = props.shippingAddress;
  }
}

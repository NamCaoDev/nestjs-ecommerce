import { Query } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { OrderNotFoundError } from '../../../domain/errors/order-not-found.error';
import { OrderReadModel } from '../../read-models/order.read-model';

/**
 * Query reading one order. Handled by {@link GetOrderByIdHandler}.
 */
export class GetOrderByIdQuery extends Query<
  Result<OrderReadModel, OrderNotFoundError>
> {
  /** Order UUID. */
  public readonly orderId: string;

  /**
   * @param props - Order identifier.
   */
  public constructor({ orderId }: { readonly orderId: string }) {
    super();
    this.orderId = orderId;
  }
}

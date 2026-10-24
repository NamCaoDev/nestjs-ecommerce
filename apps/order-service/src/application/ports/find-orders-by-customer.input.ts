/**
 * Input of {@link OrderReadPort.findByCustomer}.
 */
export interface FindOrdersByCustomerInput {
  readonly customerId: string;
  /** 1-based page number. */
  readonly page: number;
  readonly limit: number;
}

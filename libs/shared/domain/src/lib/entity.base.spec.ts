import { EntityProps } from './entity-props.interface';
import { Entity } from './entity.base';
import { ValueObject } from './value-object.base';

const CREATED_AT_EPOCH_MS = Date.UTC(2026, 0, 1);
const RENAMED_AT_EPOCH_MS = Date.UTC(2026, 1, 1);

class CustomerId extends ValueObject<string> {
  public static create(value: string): CustomerId {
    return new CustomerId(value);
  }
}

class Customer extends Entity<CustomerId> {
  public static create(props: EntityProps<CustomerId>): Customer {
    return new Customer(props);
  }

  public executeRename(occurredAt: number): void {
    this.touch(occurredAt);
  }

  public executeRenameNow(): void {
    this.touch();
  }
}

class Supplier extends Entity<CustomerId> {
  public static create(props: EntityProps<CustomerId>): Supplier {
    return new Supplier(props);
  }
}

describe('Entity', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  describe('constructor', () => {
    it('should default updatedAt to createdAt when only createdAt is given', () => {
      // Arrange
      const inputCreatedAt: number = CREATED_AT_EPOCH_MS;
      // Act
      const actualCustomer: Customer = Customer.create({
        id: CustomerId.create('c-1'),
        createdAt: inputCreatedAt,
      });
      // Assert
      expect(actualCustomer.createdAt).toBe(inputCreatedAt);
      expect(actualCustomer.updatedAt).toBe(inputCreatedAt);
    });
    it('should default both timestamps to the current time', () => {
      // Arrange
      const expectedNow: number = CREATED_AT_EPOCH_MS;
      jest.useFakeTimers({ now: expectedNow });
      // Act
      const actualCustomer: Customer = Customer.create({
        id: CustomerId.create('c-1'),
      });
      // Assert
      expect(actualCustomer.createdAt).toBe(expectedNow);
      expect(actualCustomer.updatedAt).toBe(expectedNow);
    });
  });
  describe('touch', () => {
    it('should move updatedAt forward without changing createdAt', () => {
      // Arrange
      const inputCreatedAt: number = CREATED_AT_EPOCH_MS;
      const expectedUpdatedAt: number = RENAMED_AT_EPOCH_MS;
      const actualCustomer: Customer = Customer.create({
        id: CustomerId.create('c-1'),
        createdAt: inputCreatedAt,
      });
      // Act
      actualCustomer.executeRename(expectedUpdatedAt);
      // Assert
      expect(actualCustomer.updatedAt).toBe(expectedUpdatedAt);
      expect(actualCustomer.createdAt).toBe(inputCreatedAt);
    });
    it('should default the change time to now', () => {
      // Arrange
      const expectedUpdatedAt: number = RENAMED_AT_EPOCH_MS;
      const actualCustomer: Customer = Customer.create({
        id: CustomerId.create('c-1'),
        createdAt: CREATED_AT_EPOCH_MS,
      });
      jest.useFakeTimers({ now: expectedUpdatedAt });
      // Act
      actualCustomer.executeRenameNow();
      // Assert
      expect(actualCustomer.updatedAt).toBe(expectedUpdatedAt);
    });
  });
  describe('equals', () => {
    it('should return true for entities of the same type with equal identifiers', () => {
      // Arrange
      const inputLeft: Customer = Customer.create({
        id: CustomerId.create('c-1'),
      });
      const inputRight: Customer = Customer.create({
        id: CustomerId.create('c-1'),
      });
      // Act
      const actualResult: boolean = inputLeft.equals(inputRight);
      // Assert
      expect(actualResult).toBe(true);
    });
    it('should return false for different identifiers', () => {
      // Arrange
      const inputLeft: Customer = Customer.create({
        id: CustomerId.create('c-1'),
      });
      const inputRight: Customer = Customer.create({
        id: CustomerId.create('c-2'),
      });
      // Act
      const actualResult: boolean = inputLeft.equals(inputRight);
      // Assert
      expect(actualResult).toBe(false);
    });
    it('should return false for different entity types with the same identifier', () => {
      // Arrange
      const inputCustomer: Customer = Customer.create({
        id: CustomerId.create('x-1'),
      });
      const inputSupplier: Supplier = Supplier.create({
        id: CustomerId.create('x-1'),
      });
      // Act
      const actualResult: boolean = inputCustomer.equals(inputSupplier);
      // Assert
      expect(actualResult).toBe(false);
    });
    it('should return false when compared with undefined', () => {
      // Arrange
      const inputCustomer: Customer = Customer.create({
        id: CustomerId.create('c-1'),
      });
      // Act
      const actualResult: boolean = inputCustomer.equals(undefined);
      // Assert
      expect(actualResult).toBe(false);
    });
  });
});

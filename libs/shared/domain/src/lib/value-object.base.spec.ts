import { ValueObject } from './value-object.base';

interface MoneyProps {
  readonly amount: number;
  readonly currency: string;
  readonly tags: string[];
}

class Money extends ValueObject<MoneyProps> {
  public static create(props: MoneyProps): Money {
    return new Money(props);
  }

  public get amount(): number {
    return this.props.amount;
  }

  public get tags(): readonly string[] {
    return this.props.tags;
  }
}

class Price extends ValueObject<MoneyProps> {
  public static create(props: MoneyProps): Price {
    return new Price(props);
  }
}

class Email extends ValueObject<string> {
  public static create(value: string): Email {
    return new Email(value);
  }
}

describe('ValueObject', () => {
  describe('equals', () => {
    it('should return true when both value objects hold structurally equal props', () => {
      // Arrange
      const inputLeft: Money = Money.create({
        amount: 10,
        currency: 'USD',
        tags: ['a'],
      });
      const inputRight: Money = Money.create({
        amount: 10,
        currency: 'USD',
        tags: ['a'],
      });
      // Act
      const actualResult: boolean = inputLeft.equals(inputRight);
      // Assert
      expect(actualResult).toBe(true);
    });
    it('should return false when props differ', () => {
      // Arrange
      const inputLeft: Money = Money.create({
        amount: 10,
        currency: 'USD',
        tags: ['a'],
      });
      const inputRight: Money = Money.create({
        amount: 10,
        currency: 'USD',
        tags: ['b'],
      });
      // Act
      const actualResult: boolean = inputLeft.equals(inputRight);
      // Assert
      expect(actualResult).toBe(false);
    });
    it('should return false when the concrete types differ even with equal props', () => {
      // Arrange
      const inputProps: MoneyProps = { amount: 10, currency: 'USD', tags: [] };
      const inputMoney: Money = Money.create({ ...inputProps });
      const inputPrice: Price = Price.create({ ...inputProps });
      // Act
      const actualResult: boolean = inputMoney.equals(inputPrice);
      // Assert
      expect(actualResult).toBe(false);
    });
    it('should return false when compared with undefined', () => {
      // Arrange
      const inputMoney: Money = Money.create({
        amount: 1,
        currency: 'USD',
        tags: [],
      });
      // Act
      const actualResult: boolean = inputMoney.equals(undefined);
      // Assert
      expect(actualResult).toBe(false);
    });
    it('should compare primitive-backed value objects by value', () => {
      // Arrange
      const inputLeft: Email = Email.create('john@example.com');
      const inputRight: Email = Email.create('john@example.com');
      // Act
      const actualResult: boolean = inputLeft.equals(inputRight);
      // Assert
      expect(actualResult).toBe(true);
    });
  });
  describe('isImmutable', () => {
    it('should return true for a constructed value object', () => {
      // Arrange
      const inputMoney: Money = Money.create({
        amount: 1,
        currency: 'USD',
        tags: [],
      });
      // Act
      const actualResult: boolean = inputMoney.isImmutable();
      // Assert
      expect(actualResult).toBe(true);
    });
    it('should throw when nested props are mutated', () => {
      // Arrange
      const inputMoney: Money = Money.create({
        amount: 1,
        currency: 'USD',
        tags: ['a'],
      });
      const mutableTags: string[] = inputMoney.tags as string[];
      // Act
      const actualMutation = (): number => mutableTags.push('b');
      // Assert
      expect(actualMutation).toThrow(TypeError);
      expect(inputMoney.tags).toEqual(['a']);
    });
  });
});

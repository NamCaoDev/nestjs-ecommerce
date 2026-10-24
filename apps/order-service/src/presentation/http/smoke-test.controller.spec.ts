import { SmokeTestController } from './smoke-test.controller';
import { SmokeTestResponse } from './smoke-test.response';

describe('SmokeTestController', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  describe('getSmokeTest', () => {
    it('should report the service as ok with the current timestamp', () => {
      // Arrange
      const inputNow: number = Date.UTC(2026, 9, 24);
      jest.useFakeTimers({ now: inputNow });
      const expectedResponse: SmokeTestResponse = {
        status: 'ok',
        service: 'order-service',
        timestamp: inputNow,
      };
      const controller: SmokeTestController = new SmokeTestController();
      // Act
      const actualResponse: SmokeTestResponse = controller.getSmokeTest();
      // Assert
      expect(actualResponse).toEqual(expectedResponse);
    });
  });
});

import axios, { AxiosResponse } from 'axios';

describe('GET /api/admin/test', () => {
  it('should report the inventory service as ok', async () => {
    // Given the inventory service is running
    // When the smoke-test endpoint is called
    const actualResponse: AxiosResponse = await axios.get('/api/admin/test');
    // Then it responds with the service status
    expect(actualResponse.status).toBe(200);
    expect(actualResponse.data).toEqual({
      status: 'ok',
      service: 'inventory-service',
      timestamp: expect.any(Number),
    });
  });
});

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof global.fetch;

import { GorseService } from '@/services/gorse.service';

describe('Recommendations assessment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_ASM_GORSE_01: should gracefully fallback to an empty recommendation list on 404', async () => {
    /*
     * Test Case ID: TC_ASM_GORSE_01
     * Test Objective: Xác minh degraded mode khi recommender không có user.
     * Input: Gorse trả 404 cho recommendation request.
     * Expected Output: []
     * CheckDB: Verify không phát sinh side effect ngoài fetch mock.
     * Rollback: Không ghi dữ liệu thật.
     */
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: jest.fn().mockResolvedValue('missing'),
    });

    await expect(GorseService.getRecommendations('user_999', 5)).resolves.toEqual([]);
  });
});

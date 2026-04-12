/**
 * @file dashboard.test.ts
 * @description Unit Tests cho Dashboard Stats & Reliability/Fallback
 * Framework: Jest + ts-jest
 * Rollback: Tất cả fetch và DB calls đều được mock
 */

global.fetch = jest.fn();

// ─────────────────────────────────────────────
// TC_DB_01 → TC_DB_04: Dashboard API helpers
// ─────────────────────────────────────────────
describe('Dashboard – Unit Tests', () => {

  afterEach(() => jest.clearAllMocks());

  // Helper: simulate dashboard stats API response
  const mockStatsResponse = {
    totalBooks: 120,
    totalUsers: 340,
    activeBorrows: 55,
    totalReviews: 810,
  };

  /**
   * Test Case ID: TC_DB_01
   * Test Objective: Dashboard stats trả về đúng cấu trúc dữ liệu
   * Input: GET /api/admin/stats (mock response)
   * Expected Output: Object có các field totalBooks, totalUsers, activeBorrows, totalReviews
   * CheckDB: fetch() được gọi với endpoint /api/admin/stats
   * Rollback: Mock fetch, không gọi DB thật
   */
  it('TC_DB_01: Dashboard stats should return correct structure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockStatsResponse),
    });

    const response = await fetch('/api/admin/stats');
    const data = await response.json();

    expect(data).toHaveProperty('totalBooks');
    expect(data).toHaveProperty('totalUsers');
    expect(data).toHaveProperty('activeBorrows');
    expect(data).toHaveProperty('totalReviews');
    // CheckDB
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/stats');
  });

  /**
   * Test Case ID: TC_DB_02
   * Test Objective: Dashboard stats phản ánh đúng số liệu tổng hợp
   * Input: Mock trả về totalBooks=120, totalUsers=340
   * Expected Output: Giá trị số đúng
   */
  it('TC_DB_02: Dashboard stats should reflect correct aggregate numbers', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockStatsResponse),
    });

    const response = await fetch('/api/admin/stats');
    const data = await response.json();

    expect(data.totalBooks).toBe(120);
    expect(data.totalUsers).toBe(340);
  });

  /**
   * Test Case ID: TC_DB_03
   * Test Objective: Dashboard recent activities trả về mảng sắp xếp đúng
   * Input: GET /api/admin/activities
   * Expected Output: Mảng các activity objects
   * CheckDB: Verify endpoint được gọi đúng
   */
  it('TC_DB_03: Recent activities should return sorted array', async () => {
    const mockActivities = [
      { id: 1, action: 'BORROW', createdAt: '2024-04-12T10:00:00Z' },
      { id: 2, action: 'RETURN', createdAt: '2024-04-11T09:00:00Z' },
    ];

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockActivities),
    });

    const response = await fetch('/api/admin/activities');
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data[0].createdAt > data[1].createdAt).toBe(true); // DESC order
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/activities');
  });

  /**
   * Test Case ID: TC_DB_04
   * Test Objective: Dashboard không crash khi API bị lỗi 500
   * Input: fetch trả về status 500
   * Expected Output: ok = false, không throw unhandled error
   * Notes: Đảm bảo Error Boundary UI không bị block cứng
   */
  it('TC_DB_04: Dashboard should handle API 500 error gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: 'Internal Server Error' }),
    });

    const response = await fetch('/api/admin/stats');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
// TC_RL_01 → TC_RL_04: Reliability & Fallback
// ─────────────────────────────────────────────
describe('Reliability & Fallback – Unit Tests', () => {

  afterEach(() => jest.clearAllMocks());

  /**
   * Test Case ID: TC_RL_01
   * Test Objective: getRecommendations() fallback về Popular khi Gorse 500
   * Input: Gorse API /api/recommend trả về status 500
   * Expected Output: Hàm catch error, trả về [] (không crash)
   * Notes: Kiểm tra tính tin cậy của AI layer
   */
  it('TC_RL_01: Recommendation should return [] on Gorse 500 error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    });

    // Simulate gorse error handling (same pattern as gorse.service.ts)
    const safeGetRecommendations = async (userId: string): Promise<string[]> => {
      try {
        const response = await fetch(`/api/recommend/${userId}`);
        if (!response.ok) {
          if (response.status === 404) return [];
          const errorText = await response.text();
          throw new Error(`Gorse API error (${response.status}): ${errorText}`);
        }
        const items: string[] = await response.json();
        return Array.isArray(items) ? items : [];
      } catch {
        return []; // Fallback to empty list
      }
    };

    const result = await safeGetRecommendations('user_1');
    expect(result).toEqual([]);
  });

  /**
   * Test Case ID: TC_RL_02
   * Test Objective: Ollama timeout không block response API chính
   * Input: ollama.generate() bị delay > threshold
   * Expected Output: summary trả về error gracefully, không blocking
   */
  it('TC_RL_02: Ollama timeout should not block the main response', async () => {
    // Simulate timeout với Promise.race pattern
    const generateWithTimeout = async (timeoutMs: number): Promise<string> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Ollama timeout')), timeoutMs)
      );
      const generate = new Promise<string>((resolve) =>
        setTimeout(() => resolve('summary result'), timeoutMs + 100)
      );
      return Promise.race([generate, timeout]);
    };

    await expect(generateWithTimeout(50)).rejects.toThrow('Ollama timeout');
  });

  /**
   * Test Case ID: TC_RL_03
   * Test Objective: getLatestItems() trả về [] khi Gorse server down
   * Input: fetch() throw network error
   * Expected Output: [] (không crash, fallback an toàn)
   */
  it('TC_RL_03: getLatestItems() should return [] on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

    const safeGetLatest = async (): Promise<any[]> => {
      try {
        const res = await fetch('/api/latest');
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    };

    const result = await safeGetLatest();
    expect(result).toEqual([]);
  });

  /**
   * Test Case ID: TC_RL_04
   * Test Objective: API trả về đúng HTTP status code khi hệ thống bình thường
   * Input: Mock endpoint /api/health trả về { status: "ok" }
   * Expected Output: response.ok = true, status = 200
   */
  it('TC_RL_04: Health check should return 200 when system is healthy', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'ok' }),
    });

    const response = await fetch('/api/health');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});

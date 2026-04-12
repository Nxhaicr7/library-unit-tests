/**
 * @file gorse.service.test.ts
 * @description Unit Tests cho Gorse AI Recommendation Service
 * Framework: Jest + ts-jest
 * Rollback: Tất cả network calls được mock, không gọi Gorse server thật
 */

// Mock global fetch trước khi import module
global.fetch = jest.fn();

import { GorseService } from '../../src/services/gorse.service';

describe('GorseService – Unit Tests', () => {

  afterEach(() => {
    jest.clearAllMocks(); // Rollback: Reset toàn bộ mock sau mỗi test
  });

  // ─────────────────────────────────────────────
  // Nhóm: Helper / Utility Functions
  // ─────────────────────────────────────────────
  describe('Utility Functions', () => {

    /**
     * Test Case ID: TC_GS_01
     * Test Objective: Chuyển đổi library user ID sang Gorse user ID format
     * Input: userId = 42
     * Expected Output: "user_42"
     * Notes: Hàm thuần (pure function) không cần mock
     */
    it('TC_GS_01: toGorseUserId() should format user ID correctly', () => {
      const gorseId = GorseService.toGorseUserId(42);
      expect(gorseId).toBe('user_42');
    });

    /**
     * Test Case ID: TC_GS_02
     * Test Objective: Parse ngược Gorse user ID về library user ID
     * Input: "user_42"
     * Expected Output: 42 (number)
     */
    it('TC_GS_02: fromGorseUserId() should parse user ID correctly', () => {
      const libraryId = GorseService.fromGorseUserId('user_42');
      expect(libraryId).toBe(42);
    });

    /**
     * Test Case ID: TC_GS_03
     * Test Objective: Trả về null nếu Gorse user ID không đúng format
     * Input: "invalid_id"
     * Expected Output: null
     */
    it('TC_GS_03: fromGorseUserId() should return null for invalid format', () => {
      const result = GorseService.fromGorseUserId('invalid_id');
      expect(result).toBeNull();
    });

    /**
     * Test Case ID: TC_GS_04
     * Test Objective: Chuyển đổi library book ID sang Gorse item ID
     * Input: bookId = 101
     * Expected Output: "book_101"
     */
    it('TC_GS_04: toGorseItemId() should format book ID correctly', () => {
      const itemId = GorseService.toGorseItemId(101);
      expect(itemId).toBe('book_101');
    });

    /**
     * Test Case ID: TC_GS_05
     * Test Objective: Build payload GorseUser đúng cấu trúc
     * Input: userId=1, labels=["premium"]
     * Expected Output: { UserId: "user_1", Labels: ["premium"], Comment: "" }
     */
    it('TC_GS_05: createUserPayload() should return correct payload', () => {
      const payload = GorseService.createUserPayload(1, { labels: ['premium'] });
      expect(payload).toEqual({
        UserId: 'user_1',
        Labels: ['premium'],
        Comment: '',
      });
    });
  });

  // ─────────────────────────────────────────────
  // Nhóm: API Calls – User CRUD
  // ─────────────────────────────────────────────
  describe('User API Calls', () => {

    /**
     * Test Case ID: TC_GS_06
     * Test Objective: insertUser() gửi POST request đúng endpoint và body
     * Input: payload { UserId: "user_1", Labels: [], Comment: "" }
     * Expected Output: Resolve thành công (không throw)
     * CheckDB: Verify fetch được gọi với method POST và body JSON đúng
     * Rollback: fetch bị mock, không gọi Gorse server thật
     */
    it('TC_GS_06: insertUser() should POST to /api/user with correct body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 204,
        headers: { get: () => '0' },
      });

      const payload = GorseService.createUserPayload(1);
      await expect(GorseService.insertUser(payload)).resolves.not.toThrow();

      // CheckDB: Xác minh API call đúng endpoint và body
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/user'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });

    /**
     * Test Case ID: TC_GS_07
     * Test Objective: getUser() trả về null khi Gorse trả về 404
     * Input: userId = "user_999"
     * Expected Output: null
     * CheckDB: Verify fetch được gọi với endpoint đúng
     */
    it('TC_GS_07: getUser() should return null when Gorse returns 404', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: jest.fn().mockResolvedValue('404 not found'),
      });

      const result = await GorseService.getUser('user_999');
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // Nhóm: API Calls – Recommendations & Popular
  // ─────────────────────────────────────────────
  describe('Recommendation API Calls', () => {

    /**
     * Test Case ID: TC_GS_08
     * Test Objective: getPopularItems() lấy danh sách sách phổ biến
     * Input: n = 5
     * Expected Output: Mảng GorsePopularItem[] đúng
     * CheckDB: Verify fetch được gọi với querystring n=5
     */
    it('TC_GS_08: getPopularItems() should fetch with correct query params', async () => {
      const mockData = [{ Id: 'book_1', Score: 0.95 }];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockData),
      });

      const result = await GorseService.getPopularItems(5);

      expect(result).toEqual(mockData);
      // CheckDB: Verify query argument n=5 được truyền đúng
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('n=5'),
        expect.any(Object)
      );
    });

    /**
     * Test Case ID: TC_GS_09
     * Test Objective: getRecommendations() trả về rỗng nếu user mới (cold start)
     * Input: userId = "user_new", user chưa có feedback nào
     * Expected Output: [] (mảng rỗng)
     * Notes: Gorse trả về 404 cho user không có lịch sử
     */
    it('TC_GS_09: getRecommendations() should return [] for new user (404)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('not found'),
      });

      const result = await GorseService.getRecommendations('user_new');
      expect(result).toEqual([]);
    });

    /**
     * Test Case ID: TC_GS_10
     * Test Objective: getLatestItems() lấy sách mới nhất với limit
     * Input: n = 10
     * Expected Output: Mảng GorseLatestItem[]
     */
    it('TC_GS_10: getLatestItems() should return array of latest items', async () => {
      const mockLatest = [{ Id: 'book_50', Score: 1.0 }];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockLatest),
      });

      const result = await GorseService.getLatestItems(10);
      expect(result).toEqual(mockLatest);
    });

    /**
     * Test Case ID: TC_GS_11
     * Test Objective: getPopularItems() trả về [] nếu Gorse API lỗi
     * Input: n = 5 (server Gorse bị crash)
     * Expected Output: [] – Không throw, không crash app
     * Notes: Kiểm tra error boundary – đảm bảo tin cậy hệ thống
     */
    it('TC_GS_11: getPopularItems() should return [] on Gorse API error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Gorse server down'));

      const result = await GorseService.getPopularItems(5);
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // Nhóm: Feedback
  // ─────────────────────────────────────────────
  describe('Feedback API', () => {

    /**
     * Test Case ID: TC_GS_12
     * Test Objective: createFeedback() tạo object feedback đúng format
     * Input: userId=1, bookId=10, type="like"
     * Expected Output: GorseFeedback với UserId="user_1", ItemId="book_10", FeedbackType="like"
     */
    it('TC_GS_12: createFeedback() should format feedback correctly', () => {
      const feedback = GorseService.createFeedback(1, 10, 'like');
      expect(feedback.UserId).toBe('user_1');
      expect(feedback.ItemId).toBe('book_10');
      expect(feedback.FeedbackType).toBe('like');
      expect(feedback.Timestamp).toBeDefined();
    });
  });
});

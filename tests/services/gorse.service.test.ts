import { GorseService } from '@/services/gorse.service';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof global.fetch;

describe('GorseService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('TC_GORSE_01: converts library user IDs to Gorse user IDs', () => {
    /*
     * Test Case ID: TC_GORSE_01
     * Test Objective: Xác minh quy tắc mapping user ID nội bộ sang user ID của Gorse.
     * Input: libraryUserId = 25
     * Expected Output: "user_25"
     * CheckDB: Không truy cập DB; chỉ kiểm tra giá trị trả về.
     * Rollback: Không có thay đổi dữ liệu.
     */
    expect(GorseService.toGorseUserId(25)).toBe('user_25');
  });

  it('TC_GORSE_02: rejects malformed Gorse user IDs when parsing back', () => {
    /*
     * Test Case ID: TC_GORSE_02
     * Test Objective: Đảm bảo chỉ ID đúng pattern user_<number> mới được parse ngược.
     * Input: "reader_25"
     * Expected Output: null
     * CheckDB: Không truy cập DB.
     * Rollback: Không có thay đổi dữ liệu.
     */
    expect(GorseService.fromGorseUserId('reader_25')).toBeNull();
  });

  it('TC_GORSE_02B: parses valid Gorse user IDs back to numeric IDs', () => {
    /*
     * Test Case ID: TC_GORSE_02B
     * Test Objective: Đảm bảo parse ngược đúng với ID hợp lệ.
     * Input: "user_25"
     * Expected Output: 25
     * CheckDB: Không truy cập DB.
     * Rollback: Không có thay đổi dữ liệu.
     */
    expect(GorseService.fromGorseUserId('user_25')).toBe(25);
  });

  it('TC_GORSE_03: builds user payload with default optional fields', () => {
    /*
     * Test Case ID: TC_GORSE_03
     * Test Objective: Tạo payload đồng bộ user sang Gorse với giá trị mặc định an toàn.
     * Input: userId = 8
     * Expected Output: { UserId: "user_8", Labels: [], Comment: "" }
     * CheckDB: Không truy cập DB; chỉ kiểm tra payload chuẩn bị gửi API.
     * Rollback: Không có thay đổi dữ liệu.
     */
    expect(GorseService.createUserPayload(8)).toEqual({
      UserId: 'user_8',
      Labels: [],
      Comment: '',
    });
  });

  it('TC_GORSE_04: creates feedback with normalized user and item IDs', () => {
    /*
     * Test Case ID: TC_GORSE_04
     * Test Objective: Xác minh feedback gửi sang Gorse có đúng format ID và timestamp.
     * Input: userId=3, bookId=14, feedbackType="borrow", timestamp cố định
     * Expected Output: Feedback payload chứa UserId=user_3, ItemId=book_14, Timestamp ISO.
     * CheckDB: Không truy cập DB.
     * Rollback: Không có thay đổi dữ liệu.
     */
    const fixedDate = new Date('2026-05-10T01:02:03.000Z');

    expect(
      GorseService.createFeedback(3, 14, 'borrow', {
        comment: 'borrowed',
        timestamp: fixedDate,
      })
    ).toEqual({
      FeedbackType: 'borrow',
      UserId: 'user_3',
      ItemId: 'book_14',
      Timestamp: fixedDate.toISOString(),
      Comment: 'borrowed',
    });
  });

  it('TC_GORSE_05: inserts a user through the Gorse API', async () => {
    /*
     * Test Case ID: TC_GORSE_05
     * Test Objective: Đảm bảo hàm insertUser gọi đúng endpoint, method và request body.
     * Input: user payload hợp lệ
     * Expected Output: Promise resolve, fetch được gọi với POST /api/user.
     * CheckDB: Verify HTTP payload đóng vai trò CheckDB cho recommender DB sync.
     * Rollback: fetch bị mock, không ghi vào Gorse thật.
     */
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '0' },
    });

    const payload = GorseService.createUserPayload(12, {
      labels: ['reader'],
      comment: 'Nguyen Van A',
    });

    await expect(GorseService.insertUser(payload)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/user'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
  });

  it('TC_GORSE_06: returns null when user is missing on Gorse', async () => {
    /*
     * Test Case ID: TC_GORSE_06
     * Test Objective: Khi user chưa được sync sang Gorse, service phải trả về null thay vì throw.
     * Input: userId = "user_404"
     * Expected Output: null
     * CheckDB: Verify request GET đúng endpoint /api/user/user_404.
     * Rollback: fetch bị mock, không tác động DB ngoài.
     */
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: jest.fn().mockResolvedValue('Not Found'),
      headers: { get: () => null },
    });

    await expect(GorseService.getUser('user_404')).resolves.toBeNull();
  });

  it('TC_GORSE_06B: returns a user object when Gorse has the user', async () => {
    /*
     * Test Case ID: TC_GORSE_06B
     * Test Objective: Lấy đúng object user từ Gorse khi user tồn tại.
     * Input: userId = "user_1"
     * Expected Output: GorseUser object
     * CheckDB: Verify endpoint GET /api/user/user_1.
     * Rollback: fetch bị mock, không gọi external service thật.
     */
    const user = {
      UserId: 'user_1',
      Labels: ['reader'],
      Comment: 'Reader 1',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => '100' },
      json: jest.fn().mockResolvedValue(user),
    });

    await expect(GorseService.getUser('user_1')).resolves.toEqual(user);
  });

  it('TC_GORSE_07: returns empty recommendations when Gorse answers 404', async () => {
    /*
     * Test Case ID: TC_GORSE_07
     * Test Objective: Route gợi ý phải fallback rỗng khi user chưa tồn tại trong recommender.
     * Input: userId = "user_99", n = 5
     * Expected Output: []
     * CheckDB: Verify GET /api/recommend/user_99?n=5.
     * Rollback: fetch bị mock, không đọc/ghi external DB thật.
     */
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: jest.fn().mockResolvedValue('missing'),
    });

    await expect(GorseService.getRecommendations('user_99', 5)).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/recommend/user_99?n=5'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('TC_GORSE_08: fetches popular items with query parameters', async () => {
    /*
     * Test Case ID: TC_GORSE_08
     * Test Objective: Kiểm tra popular items có ghép query n và category chính xác.
     * Input: n = 3, category = "Novel"
     * Expected Output: Mảng popular items từ API.
     * CheckDB: Verify endpoint /api/non-personalized/most_starred?n=3&category=Novel.
     * Rollback: fetch bị mock, không gọi Gorse thật.
     */
    const popularItems = [
      { Id: 'book_1', Score: 0.9 },
      { Id: 'book_2', Score: 0.8 },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(popularItems),
    });

    await expect(GorseService.getPopularItems(3, 'Novel')).resolves.toEqual(popularItems);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/non-personalized/most_starred?n=3&category=Novel'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('TC_GORSE_09: returns empty latest items on upstream failure', async () => {
    /*
     * Test Case ID: TC_GORSE_09
     * Test Objective: Không làm hỏng ứng dụng khi Gorse lỗi lúc tải latest items.
     * Input: n = 4, offset = 8
     * Expected Output: []
     * CheckDB: Verify request GET tới /api/latest?n=4&offset=8.
     * Rollback: fetch bị mock, không phát sinh side effect.
     */
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: jest.fn().mockResolvedValue('boom'),
    });

    await expect(GorseService.getLatestItems(4, 8)).resolves.toEqual([]);
    consoleSpy.mockRestore();
  });

  it('TC_GORSE_10: inserts feedback array through the Gorse API', async () => {
    /*
     * Test Case ID: TC_GORSE_10
     * Test Objective: Đảm bảo feedback được gửi đúng dạng mảng sang Gorse.
     * Input: Array feedback hợp lệ
     * Expected Output: Promise resolve
     * CheckDB: Verify POST /api/feedback với JSON array.
     * Rollback: fetch bị mock, không ghi dữ liệu thật.
     */
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '0' },
    });
    const feedback = [
      GorseService.createFeedback(1, 10, 'read'),
      GorseService.createFeedback(1, 11, 'like'),
    ];

    await expect(GorseService.insertFeedback(feedback)).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/feedback'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(feedback),
      })
    );
  });

  it('TC_GORSE_11: fetches neighbor items for a given book', async () => {
    /*
     * Test Case ID: TC_GORSE_11
     * Test Objective: Kiểm tra API lấy sách tương tự theo item neighbors.
     * Input: itemId=book_1, n=2, offset=0
     * Expected Output: Array neighbor items
     * CheckDB: Verify endpoint neighbors đúng query params.
     * Rollback: fetch bị mock, không gọi Gorse thật.
     */
    const neighbors = [
      { Id: 'book_2', Score: 0.91 },
      { Id: 'book_3', Score: 0.88 },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(neighbors),
    });

    await expect(GorseService.getItemNeighbors('book_1', 2, 0)).resolves.toEqual(neighbors);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/item/book_1/neighbors?n=2&offset=0'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('TC_GORSE_12: updates a synced user through the Gorse API', async () => {
    /*
     * Test Case ID: TC_GORSE_12
     * Test Objective: Bao phủ nhánh PATCH dùng để cập nhật labels/comment của user trên Gorse.
     * Input: userId="user_5", partial payload hợp lệ
     * Expected Output: Promise resolve, gọi PATCH đúng endpoint và request body.
     * CheckDB: Verify HTTP method/body cho endpoint cập nhật user.
     * Rollback: fetch bị mock, không ghi Gorse thật.
     */
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '0' },
    });

    await expect(
      GorseService.updateUser('user_5', { Labels: ['vip'], Comment: 'updated' })
    ).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/user/user_5'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ Labels: ['vip'], Comment: 'updated' }),
      })
    );
  });

  it('TC_GORSE_13: deletes a synced user through the Gorse API', async () => {
    /*
     * Test Case ID: TC_GORSE_13
     * Test Objective: Bao phủ nhánh DELETE để xóa user khỏi recommender.
     * Input: userId="user_5"
     * Expected Output: Promise resolve, gọi DELETE đúng endpoint.
     * CheckDB: Verify HTTP method cho endpoint xóa user.
     * Rollback: fetch bị mock, không xóa dữ liệu ngoài thật.
     */
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '0' },
    });

    await expect(GorseService.deleteUser('user_5')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/user/user_5'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('TC_GORSE_14: fetches paginated Gorse users with cursor and page size', async () => {
    /*
     * Test Case ID: TC_GORSE_14
     * Test Objective: Bao phủ nhánh list users có query cursor/n cho phần quản trị đồng bộ.
     * Input: cursor="next-page", n=20
     * Expected Output: object chứa Users và Cursor từ API.
     * CheckDB: Verify endpoint /api/users?cursor=...&n=...
     * Rollback: fetch bị mock, không đọc recommender thật.
     */
    const payload = {
      Users: [{ UserId: 'user_1', Labels: ['reader'], Comment: 'Reader 1' }],
      Cursor: 'next-page-2',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => '100' },
      json: jest.fn().mockResolvedValue(payload),
    });

    await expect(GorseService.getUsers({ cursor: 'next-page', n: 20 })).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users?cursor=next-page&n=20'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });
});

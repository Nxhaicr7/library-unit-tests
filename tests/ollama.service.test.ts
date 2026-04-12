/**
 * @file ollama.service.test.ts
 * @description Unit Tests cho Ollama AI Summary & Embedding Services
 * Framework: Jest + ts-jest
 * Rollback: Tất cả Ollama calls được mock, không gọi model AI thật
 */

// Mock module 'ollama' trước khi import để chặn kết nối real LLM
jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    list: jest.fn(),
    generate: jest.fn(),
    embeddings: jest.fn(),
  })),
}));

import { ollamaSummaryService } from '../../src/services/ollamaSummary.service';

describe('OllamaSummaryService – Unit Tests', () => {

  let mockGenerate: jest.Mock;
  let mockList: jest.Mock;

  beforeEach(() => {
    // Lấy reference đến các mock function từ ollama instance
    mockGenerate = (ollamaSummaryService as any).ollama.generate as jest.Mock;
    mockList = (ollamaSummaryService as any).ollama.list as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks(); // Rollback: Xóa trạng thái mock sau mỗi test
  });

  // ─────────────────────────────────────────────
  // Nhóm: isAvailable()
  // ─────────────────────────────────────────────
  describe('isAvailable()', () => {

    /**
     * Test Case ID: TC_OL_01
     * Test Objective: Trả về true khi Ollama server đang chạy
     * Input: ollama.list() resolve thành công
     * Expected Output: true
     */
    it('TC_OL_01: should return true when Ollama server is running', async () => {
      mockList.mockResolvedValue({ models: [] });

      const available = await ollamaSummaryService.isAvailable();
      expect(available).toBe(true);
    });

    /**
     * Test Case ID: TC_OL_02
     * Test Objective: Trả về false khi Ollama server không kết nối được
     * Input: ollama.list() throw Error("ECONNREFUSED")
     * Expected Output: false
     * Notes: Đảm bảo không crash app khi AI service down
     */
    it('TC_OL_02: should return false when Ollama server is unavailable', async () => {
      mockList.mockRejectedValue(new Error('ECONNREFUSED'));

      const available = await ollamaSummaryService.isAvailable();
      expect(available).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // Nhóm: generateBookSummary()
  // ─────────────────────────────────────────────
  describe('generateBookSummary()', () => {

    /**
     * Test Case ID: TC_OL_03
     * Test Objective: Sinh tóm tắt sách thành công với ngôn ngữ tiếng Việt
     * Input: { title: "Doraemon", author: "Fujiko F. Fujio" }, options: { language: "vi" }
     * Expected Output: { success: true, summary: "Tóm tắt sách mẫu" }
     * CheckDB: Verify ollama.generate() được gọi với promptxứa chứa tên sách và tác giả
     * Rollback: Mock generate(), không gọi LLM thật
     */
    it('TC_OL_03: should generate Vietnamese book summary successfully', async () => {
      const mockSummaryText = 'Tóm tắt: Doraemon là câu chuyện về chú mèo máy đến từ tương lai.';
      mockGenerate.mockResolvedValue({ response: mockSummaryText });

      const result = await ollamaSummaryService.generateBookSummary(
        { title: 'Doraemon', author: 'Fujiko F. Fujio' },
        { language: 'vi', maxLength: 100 }
      );

      expect(result.success).toBe(true);
      expect(result.summary).toBe(mockSummaryText);
      // CheckDB: Xác minh generate được gọi với prompt chứa tên sách
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Doraemon'),
        })
      );
    });

    /**
     * Test Case ID: TC_OL_04
     * Test Objective: Sinh tóm tắt sách thành công với ngôn ngữ tiếng Anh
     * Input: { title: "1984", author: "George Orwell" }, options: { language: "en" }
     * Expected Output: { success: true, summary: "English summary text" }
     */
    it('TC_OL_04: should generate English book summary successfully', async () => {
      const mockSummaryText = 'A dystopian novel by George Orwell set in a totalitarian society.';
      mockGenerate.mockResolvedValue({ response: mockSummaryText });

      const result = await ollamaSummaryService.generateBookSummary(
        { title: '1984', author: 'George Orwell' },
        { language: 'en' }
      );

      expect(result.success).toBe(true);
      expect(result.summary).toBe(mockSummaryText);
      // CheckDB: Kiểm tra prompt tiếng Anh được dùng
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Write a brief'),
        })
      );
    });

    /**
     * Test Case ID: TC_OL_05
     * Test Objective: Xử lý lỗi khi Ollama server crash/timeout
     * Input: { title: "Any Book", author: "Any Author" } – server bị ngắt
     * Expected Output: { success: false, summary: "", error: "Connection refused" }
     * Notes: Bắt error và không để crash ứng dụng
     */
    it('TC_OL_05: should handle Ollama server crash gracefully', async () => {
      mockGenerate.mockRejectedValue(new Error('Connection refused'));

      const result = await ollamaSummaryService.generateBookSummary({
        title: 'Any Book',
        author: 'Any Author',
      });

      expect(result.success).toBe(false);
      expect(result.summary).toBe('');
      expect(result.error).toBe('Connection refused');
    });

    /**
     * Test Case ID: TC_OL_06
     * Test Objective: Xử lý khi Ollama trả về response rỗng
     * Input: { title: "Empty Book", author: "Author" }
     * Expected Output: { success: true, summary: "" } – không throw
     * Notes: Edge case – model trả về chuỗi rỗng
     */
    it('TC_OL_06: should handle empty response from Ollama', async () => {
      mockGenerate.mockResolvedValue({ response: '' });

      const result = await ollamaSummaryService.generateBookSummary({
        title: 'Empty Book',
        author: 'Author',
      });

      expect(result.success).toBe(true);
      expect(result.summary).toBe('');
    });
  });
});

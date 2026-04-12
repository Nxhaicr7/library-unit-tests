import { GorseService } from '../src/services/gorse.service';
import { ollamaSummaryService } from '../src/services/ollamaSummary.service';
import { Ollama } from 'ollama';

// Khởi tạo mock cho global fetch (để test Gorse API)
global.fetch = jest.fn();

// Mock đối tượng Ollama (của library ollama)
jest.mock('ollama', () => {
  return {
    Ollama: jest.fn().mockImplementation(() => {
      return {
        list: jest.fn(),
        generate: jest.fn()
      }
    })
  };
});

describe('Unit Tests for AI Services (Gorse & Ollama)', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GorseService Tests', () => {
    
    // TC_01
    it('TC_GS_01: Should successfully get popular items', async () => {
      /*
       * Test Case ID: TC_GS_01
       * Test Objective: Kiểm tra hàm lấy danh sách items phổ biến từ Gorse AI
       * Input: n = 10
       * Expected Output: Mảng các GorsePopularItem
       * CheckDB: Verify mock fetch() được gọi với tham số querystring n=10
       * Rollback: Dùng Jest mock để chặn API thực thi
       */
      const mockPopular = [{ Id: 'book_1', Score: 0.9 }, { Id: 'book_2', Score: 0.8 }];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockPopular)
      });

      const items = await GorseService.getPopularItems(10);
      
      expect(items).toEqual(mockPopular);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/non-personalized/most_starred?n=10'),
        expect.any(Object)
      );
    });

    // TC_02
    it('TC_GS_02: Should handle user insertion feedback sync', async () => {
      /*
       * Test Case ID: TC_GS_02
       * Test Objective: Thêm mới User vào CSDL Recommender Gorse
       * Input: payload user id=123, labels=["reader"]
       * Expected Output: Promise resolve, không quăng lỗi
       * CheckDB: Verify method POST và JSON body payload
       */
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 204,
        headers: { get: () => '0' },
        json: jest.fn().mockResolvedValue({})
      });

      const payload = GorseService.createUserPayload(123, { labels: ['reader'] });
      expect(payload.UserId).toBe('user_123');

      await expect(GorseService.insertUser(payload)).resolves.not.toThrow();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/user'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload)
        })
      );
    });
  });

  describe('Ollama Summary Service Tests', () => {
    
    let mockGenerate: jest.Mock;

    beforeEach(() => {
      mockGenerate = jest.fn();
      (ollamaSummaryService as any).ollama.generate = mockGenerate;
    });

    // TC_03
    it('TC_OL_01: Generate book summary should succeed', async () => {
      /*
       * Test Case ID: TC_OL_01
       * Test Objective: Sinh tóm tắt sách dựa trên mô hình Ollama AI
       * Input: { title: "Doraemon", author: "Fujiko" }
       * Expected Output: { success: true, summary: "Tóm tắt mẫu" }
       * CheckDB: Verify `ollama.generate` được gọi với đúng model
       * Rollback: Mock `ollama.generate`, không lưu DB thực tế
       */
      const mockResult = "Đây là tóm tắt sách";
      mockGenerate.mockResolvedValue({ response: mockResult });

      const result = await ollamaSummaryService.generateBookSummary({
        title: "Doraemon",
        author: "Fujiko"
      });

      expect(result.success).toBe(true);
      expect(result.summary).toBe(mockResult);
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          prompt: expect.stringContaining("Doraemon")
        })
      );
    });

    // TC_04
    it('TC_OL_02: Generate book summary should handle Ollama crash/error', async () => {
      /*
       * Test Case ID: TC_OL_02
       * Test Objective: Xử lý ngoại lệ khi mô hình LLM bị ngắt kết nối hoặc throw error
       * Input: { title: "Doraemon", author: "Fujiko" } (khi server Ollama down)
       * Expected Output: { success: false, summary: "", error: "Connection error" }
       * CheckDB: Không thay đổi/lưu trữ bất kỳ gì.
       */
      mockGenerate.mockRejectedValue(new Error("Connection error"));

      const result = await ollamaSummaryService.generateBookSummary({
        title: "Error Book",
        author: "Unknown"
      });

      expect(result.success).toBe(false);
      expect(result.summary).toBe('');
      expect(result.error).toBe("Connection error");
    });
  });

});

const mockList = jest.fn();
const mockGenerate = jest.fn();
const mockEmbeddings = jest.fn();

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    list: mockList,
    generate: mockGenerate,
    embeddings: mockEmbeddings,
  })),
}));

import { embeddingService } from '@/services/ollamaEmbedding.service';
import { ollamaSummaryService } from '@/services/ollamaSummary.service';

describe('Ollama services', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockGenerate.mockReset();
    mockEmbeddings.mockReset();
  });

  it('TC_OLLAMA_01: confirms Ollama availability when model list succeeds', async () => {
    /*
     * Test Case ID: TC_OLLAMA_01
     * Test Objective: Kiểm tra health-check của Ollama summary service.
     * Input: list() resolve thành công
     * Expected Output: true
     * CheckDB: Không truy cập DB; chỉ kiểm tra kết nối tới Ollama client mock.
     * Rollback: Dùng jest.mock, không kết nối Ollama thật.
     */
    mockList.mockResolvedValue({ models: [] });

    await expect(ollamaSummaryService.isAvailable()).resolves.toBe(true);
  });

  it('TC_OLLAMA_02: returns false when Ollama health-check fails', async () => {
    /*
     * Test Case ID: TC_OLLAMA_02
     * Test Objective: Xử lý an toàn khi Ollama không sẵn sàng.
     * Input: list() throw error
     * Expected Output: false
     * CheckDB: Không truy cập DB.
     * Rollback: Mock client, không có side effect.
     */
    mockList.mockRejectedValue(new Error('connection refused'));

    await expect(ollamaSummaryService.isAvailable()).resolves.toBe(false);
  });

  it('TC_OLLAMA_03: generates Vietnamese summary and trims the response', async () => {
    /*
     * Test Case ID: TC_OLLAMA_03
     * Test Objective: Sinh tóm tắt sách tiếng Việt với prompt đúng và loại bỏ khoảng trắng thừa.
     * Input: { title: "Doraemon", author: "Fujiko" }, language = "vi"
     * Expected Output: { success: true, summary: "Tom tat mau" }
     * CheckDB: Verify payload gửi sang ollama.generate chứa tiêu đề sách và prompt tiếng Việt.
     * Rollback: Mock generate, không lưu dữ liệu thật.
     */
    mockGenerate.mockResolvedValue({ response: '  Tom tat mau  ' });

    const result = await ollamaSummaryService.generateBookSummary(
      { title: 'Doraemon', author: 'Fujiko' },
      { language: 'vi', maxLength: 80 }
    );

    expect(result).toEqual({
      success: true,
      summary: 'Tom tat mau',
    });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Viết mô tả ngắn gọn (80 từ) cho sách "Doraemon"'),
      })
    );
  });

  it('TC_OLLAMA_04: generates English summary with English prompt template', async () => {
    /*
     * Test Case ID: TC_OLLAMA_04
     * Test Objective: Đảm bảo prompt tiếng Anh được tạo đúng khi language = en.
     * Input: { title: "Clean Code", author: "Robert C. Martin" }, language = "en"
     * Expected Output: success=true và prompt chứa "Write a brief".
     * CheckDB: Verify payload generate() dùng prompt tiếng Anh.
     * Rollback: Mock generate, không gọi model thật.
     */
    mockGenerate.mockResolvedValue({ response: 'A concise summary.' });

    const result = await ollamaSummaryService.generateBookSummary(
      { title: 'Clean Code', author: 'Robert C. Martin' },
      { language: 'en', maxLength: 60 }
    );

    expect(result.success).toBe(true);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Write a brief 60-word description for "Clean Code"'),
      })
    );
  });

  it('TC_OLLAMA_05: returns structured failure when summary generation crashes', async () => {
    /*
     * Test Case ID: TC_OLLAMA_05
     * Test Objective: Chuẩn hóa lỗi từ Ollama để API layer có thể fallback.
     * Input: generate() throw "timeout"
     * Expected Output: { success:false, summary:"", error:"timeout" }
     * CheckDB: Không có thay đổi DB.
     * Rollback: Mock generate, không gọi LLM thật.
     */
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerate.mockRejectedValue(new Error('timeout'));

    await expect(
      ollamaSummaryService.generateBookSummary({ title: 'Timeout Book', author: 'Unknown' })
    ).resolves.toEqual({
      success: false,
      summary: '',
      error: 'timeout',
    });

    consoleSpy.mockRestore();
  });

  it('TC_OLLAMA_06: rejects empty text when generating embeddings', async () => {
    /*
     * Test Case ID: TC_OLLAMA_06
     * Test Objective: Ngăn request embedding vô nghĩa với input rỗng.
     * Input: "   "
     * Expected Output: throw Error("Input text cannot be empty")
     * CheckDB: Không truy cập DB.
     * Rollback: Không có thay đổi dữ liệu.
     */
    await expect(embeddingService.generateVector('   ')).rejects.toThrow(
      'Input text cannot be empty'
    );
  });

  it('TC_OLLAMA_07: normalizes newlines before requesting embeddings', async () => {
    /*
     * Test Case ID: TC_OLLAMA_07
     * Test Objective: Đảm bảo text gửi cho model embedding được chuẩn hóa thành một dòng.
     * Input: "Line 1\\nLine 2"
     * Expected Output: embedding trả về từ client mock, prompt gửi đi là "Line 1 Line 2"
     * CheckDB: Verify payload embeddings() đúng model/prompt.
     * Rollback: Mock embeddings, không tạo vector thật.
     */
    const embedding = [0.1, 0.2, 0.3];
    mockEmbeddings.mockResolvedValue({ embedding });

    await expect(embeddingService.generateVector('Line 1\nLine 2')).resolves.toEqual(embedding);
    expect(mockEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Line 1 Line 2',
      })
    );
  });

  it('TC_OLLAMA_08: generates batch vectors sequentially', async () => {
    /*
     * Test Case ID: TC_OLLAMA_08
     * Test Objective: Kiểm tra batch embedding giữ đúng thứ tự kết quả theo input.
     * Input: ["alpha", "beta"]
     * Expected Output: [[1], [2]] theo đúng thứ tự
     * CheckDB: Verify embeddings() được gọi hai lần tương ứng từng phần tử.
     * Rollback: Mock embeddings, không tạo vector thật.
     */
    mockEmbeddings
      .mockResolvedValueOnce({ embedding: [1] })
      .mockResolvedValueOnce({ embedding: [2] });

    await expect(embeddingService.generateBatchVectors(['alpha', 'beta'])).resolves.toEqual([
      [1],
      [2],
    ]);
    expect(mockEmbeddings).toHaveBeenCalledTimes(2);
  });
});

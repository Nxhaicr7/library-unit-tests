async function loadGeminiModule(apiKey = '') {
  jest.resetModules();

  if (apiKey) {
    process.env.GEMINI_API_KEY = apiKey;
  } else {
    delete process.env.GEMINI_API_KEY;
  }

  const mockGenerateContent = jest.fn();

  jest.doMock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    })),
  }));

  const module = await import('@/services/gemini.service');
  return {
    GeminiService: module.GeminiService,
    mockGenerateContent,
  };
}

describe('GeminiService', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_GEMINI_01: reports configuration missing when API key is absent', async () => {
    /*
     * Test Case ID: TC_GEMINI_01
     * Test Objective: Không cho phép gọi Gemini khi thiếu cấu hình bảo mật.
     * Input: GEMINI_API_KEY không tồn tại
     * Expected Output: success=false, summary="", có message yêu cầu cấu hình API key
     * CheckDB: Không truy cập DB.
     * Rollback: Không tạo request ra ngoài.
     */
    const { GeminiService, mockGenerateContent } = await loadGeminiModule();

    await expect(
      GeminiService.generateBookSummary({ title: 'Atomic Habits', author: 'James Clear' })
    ).resolves.toEqual({
      success: false,
      summary: '',
      error:
        'Gemini API is not configured. Please set GEMINI_API_KEY in environment variables.',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('TC_GEMINI_02: parses JSON payload even when Gemini wraps it in markdown fences', async () => {
    /*
     * Test Case ID: TC_GEMINI_02
     * Test Objective: Dọn sạch markdown fence và parse JSON response từ Gemini.
     * Input: response.text = ```json { "summary": "..." } ```
     * Expected Output: success=true, summary chứa nội dung đã parse
     * CheckDB: Verify request model/content được gọi đúng 1 lần.
     * Rollback: Mock SDK, không gọi Gemini thật.
     */
    const { GeminiService, mockGenerateContent } = await loadGeminiModule('dummy-key');
    mockGenerateContent.mockResolvedValue({
      text: '```json\n{ "summary": "Tom tat Gemini" }\n```',
    });

    await expect(
      GeminiService.generateBookSummary(
        { title: 'Sherlock Holmes', author: 'Arthur Conan Doyle' },
        { language: 'vi', maxLength: 120 }
      )
    ).resolves.toEqual({
      success: true,
      summary: 'Tom tat Gemini',
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('Respond in Vietnamese.'),
      })
    );
  });

  it('TC_GEMINI_03: returns structured error when Gemini response is invalid JSON', async () => {
    /*
     * Test Case ID: TC_GEMINI_03
     * Test Objective: Chuẩn hóa lỗi parse JSON để API layer dễ fallback.
     * Input: response.text = "not-json"
     * Expected Output: success=false, summary=""
     * CheckDB: Không truy cập DB.
     * Rollback: Mock SDK, không có ghi dữ liệu ngoài.
     */
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { GeminiService, mockGenerateContent } = await loadGeminiModule('dummy-key');
    mockGenerateContent.mockResolvedValue({
      text: 'not-json',
    });

    const result = await GeminiService.generateBookSummary({
      title: 'Invalid JSON',
      author: 'Gemini',
    });

    expect(result.success).toBe(false);
    expect(result.summary).toBe('');
    expect(result.error).toContain('Unexpected token');
    consoleSpy.mockRestore();
  });

  it('TC_GEMINI_04: builds an English prompt when language is set to en', async () => {
    /*
     * Test Case ID: TC_GEMINI_04
     * Test Objective: Đảm bảo prompt tiếng Anh được tạo đúng khi caller chọn language=en.
     * Input: title/author hợp lệ, options.language="en"
     * Expected Output: success=true và prompt chứa instruction English.
     * CheckDB: Verify request gửi sang Gemini có prompt English.
     * Rollback: Mock SDK, không gọi Gemini thật.
     */
    const { GeminiService, mockGenerateContent } = await loadGeminiModule('dummy-key');
    mockGenerateContent.mockResolvedValue({
      text: '{ "summary": "English summary" }',
    });

    const result = await GeminiService.generateBookSummary(
      { title: 'Clean Code', author: 'Robert C. Martin' },
      { language: 'en' }
    );

    expect(result).toEqual({
      success: true,
      summary: 'English summary',
    });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('Respond in English.'),
      })
    );
  });

  it('TC_GEMINI_05: includes caller-provided maxLength in the prompt', async () => {
    /*
     * Test Case ID: TC_GEMINI_05
     * Test Objective: Đảm bảo prompt phản ánh đúng maxLength bất thường mà caller truyền vào.
     * Input: maxLength=1 và maxLength=1000
     * Expected Output: Cả hai lần gọi đều success và prompt chứa giá trị giới hạn tương ứng.
     * CheckDB: Verify request contents chứa maximum 1 words và maximum 1000 words.
     * Rollback: Mock SDK, không gọi Gemini thật.
     */
    const { GeminiService, mockGenerateContent } = await loadGeminiModule('dummy-key');
    mockGenerateContent.mockResolvedValue({
      text: '{ "summary": "Boundary summary" }',
    });

    await expect(
      GeminiService.generateBookSummary(
        { title: 'Tiny', author: 'Tester' },
        { maxLength: 1, language: 'vi' }
      )
    ).resolves.toEqual({
      success: true,
      summary: 'Boundary summary',
    });

    await expect(
      GeminiService.generateBookSummary(
        { title: 'Large', author: 'Tester' },
        { maxLength: 1000, language: 'vi' }
      )
    ).resolves.toEqual({
      success: true,
      summary: 'Boundary summary',
    });

    expect(mockGenerateContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contents: expect.stringContaining('maximum 1 words'),
      })
    );
    expect(mockGenerateContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contents: expect.stringContaining('maximum 1000 words'),
      })
    );
  });
});

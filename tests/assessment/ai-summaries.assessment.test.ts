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

import { ollamaSummaryService } from '@/services/ollamaSummary.service';

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

describe('AI Summaries assessment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    jest.resetModules();
  });

  it('TC_ASM_OLLAMA_01: should mark generation as failed when Ollama returns an empty summary', async () => {
    mockGenerate.mockResolvedValue({ response: '   ' });

    await expect(
      ollamaSummaryService.generateBookSummary({ title: 'Blank Book', author: 'Unknown' })
    ).resolves.toEqual({
      success: false,
      summary: '',
      error: 'Empty summary returned by model',
    });
  });

  it('TC_ASM_GEMINI_01: should fail if Gemini JSON response has no summary field', async () => {
    const { GeminiService, mockGenerateContent } = await loadGeminiModule('dummy-key');
    mockGenerateContent.mockResolvedValue({
      text: '{"keywords":["ai","search"]}',
    });

    await expect(
      GeminiService.generateBookSummary({ title: 'Vector Search', author: 'Tester' })
    ).resolves.toEqual({
      success: false,
      summary: '',
      error: 'Missing summary field in Gemini response',
    });
  });

  it('TC_ASM_GEMINI_02: should report a configuration error when GEMINI_API_KEY is missing', async () => {
    const { GeminiService } = await loadGeminiModule();

    const result = await GeminiService.generateBookSummary({
      title: 'No Key',
      author: 'Tester',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

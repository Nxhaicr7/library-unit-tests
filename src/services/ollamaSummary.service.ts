/**
 * Ollama Summary Service
 *
 * Service for generating book summaries using Ollama with gemma2:2b model.
 * Used for text summarization based on book title and author.
 */

import { Ollama } from 'ollama';

/**
 * Summary result interface
 */
export interface SummaryResult {
  summary: string;
  success: boolean;
  error?: string;
}

/**
 * Book info input for summary generation
 */
export interface BookSummaryInput {
  title: string;
  author: string;
}

/**
 * Options for summary generation
 */
export interface SummaryOptions {
  maxLength?: number;
  language?: 'vi' | 'en';
}

class OllamaSummaryService {
  private ollama: Ollama;
  private modelName: string;

  constructor() {
    // Initialize client connecting to localhost:11434 by default
    this.ollama = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    });
    this.modelName = process.env.OLLAMA_SUMMARY_MODEL || 'gemma2:2b';
  }

  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a book summary based on title and author
   *
   * @param bookInfo - The book title and author
   * @param options - Options for summarization
   * @returns SummaryResult with summary
   */
  async generateBookSummary(
    bookInfo: BookSummaryInput,
    options?: SummaryOptions
  ): Promise<SummaryResult> {
    const { title, author } = bookInfo;
    const maxLength = options?.maxLength || 100;
    const language = options?.language || 'vi';

    // Simple, direct prompt for faster generation
    const prompt =
      language === 'vi'
        ? `Viết mô tả ngắn gọn (${maxLength} từ) cho sách "${title}" của ${author}. Chỉ trả về mô tả, không giải thích.`
        : `Write a brief ${maxLength}-word description for "${title}" by ${author}. Return only the description.`;

    try {
      const response = await this.ollama.generate({
        model: this.modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 250,
          num_ctx: 256,
        },
      });

      const summary = (response.response || '').trim();

      return {
        summary,
        success: true,
      };
    } catch (error) {
      console.error(
        `[OllamaSummary] Failed to generate book summary:`,
        error instanceof Error ? error.message : error
      );
      return {
        summary: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const ollamaSummaryService = new OllamaSummaryService();

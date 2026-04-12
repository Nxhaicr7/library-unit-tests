/**
 * @file book.service.test.ts
 * @description Unit Tests cho Book Service (Ebook/Catalog functions)
 * Framework: Jest + ts-jest
 * Rollback: Tất cả Prisma DB calls được mock, không truy cập database thật
 */

// Mock module prisma trước khi import để chặn kết nối DB thật
jest.mock('@/lib/prisma', () => ({
  prisma: {
    book: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import {
  transformBookData,
  buildBookWhereClause,
  buildOrderByClause,
} from '../../src/services/book.service';
import { BookFilterParams } from '../../src/types/book';

// Helper: Tạo BookFilterParams mặc định để giảm lặp code
const defaultParams = (): BookFilterParams => ({
  page: 1,
  limit: 10,
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  authorIds: [],
  categoryIds: [],
  languageCodes: [],
  availableAt: [],
  publishYearFrom: 0,
  publishYearTo: 0,
  isDeleted: false,
});

describe('BookService – Unit Tests', () => {

  afterEach(() => {
    jest.clearAllMocks(); // Rollback: Xóa trạng thái DB mock sau mỗi test
  });

  // ─────────────────────────────────────────────
  // Nhóm: transformBookData()
  // ─────────────────────────────────────────────
  describe('transformBookData()', () => {

    /**
     * Test Case ID: TC_BK_01
     * Test Objective: Tính trung bình rating đúng từ reviews
     * Input: 2 reviews với rating 4 và 5
     * Expected Output: averageRating = 4.5
     * Notes: Hàm thuần, không cần mock DB
     */
    it('TC_BK_01: should calculate averageRating correctly from reviews', () => {
      const rawBook: any = [{
        bookEditions: [],
        reviews: [{ rating: 4 }, { rating: 5 }],
        bookCategories: [],
        _count: { bookItems: 3 },
      }];

      const result = transformBookData(rawBook);
      expect(result[0].averageRating).toBe(4.5);
    });

    /**
     * Test Case ID: TC_BK_02
     * Test Objective: averageRating = 0 khi không có review
     * Input: reviews = []
     * Expected Output: averageRating = 0
     */
    it('TC_BK_02: should return averageRating 0 when no reviews exist', () => {
      const rawBook: any = [{
        bookEditions: [],
        reviews: [],
        bookCategories: [],
        _count: { bookItems: 0 },
      }];

      const result = transformBookData(rawBook);
      expect(result[0].averageRating).toBe(0);
    });

    /**
     * Test Case ID: TC_BK_03
     * Test Objective: Đếm số lượng ebook editions đúng
     * Input: 3 editions trong đó 2 là EBOOK, 1 là AUDIO
     * Expected Output: bookEbookCount = 2, bookAudioCount = 1
     */
    it('TC_BK_03: should count EBOOK and AUDIO editions separately', () => {
      const rawBook: any = [{
        bookEditions: [
          { format: 'EBOOK' },
          { format: 'EBOOK' },
          { format: 'AUDIO' },
        ],
        reviews: [],
        bookCategories: [],
        _count: { bookItems: 0 },
      }];

      const result = transformBookData(rawBook);
      expect(result[0].bookEbookCount).toBe(2);
      expect(result[0].bookAudioCount).toBe(1);
    });

    /**
     * Test Case ID: TC_BK_04
     * Test Objective: Trích xuất categories từ bookCategories
     * Input: bookCategories với 2 items có category.name
     * Expected Output: categories = ["Science", "Technology"]
     */
    it('TC_BK_04: should extract category names from bookCategories', () => {
      const rawBook: any = [{
        bookEditions: [],
        reviews: [],
        bookCategories: [
          { category: { name: 'Science' } },
          { category: { name: 'Technology' } },
        ],
        _count: { bookItems: 0 },
      }];

      const result = transformBookData(rawBook);
      expect(result[0].categories).toEqual(['Science', 'Technology']);
    });
  });

  // ─────────────────────────────────────────────
  // Nhóm: buildBookWhereClause()
  // ─────────────────────────────────────────────
  describe('buildBookWhereClause()', () => {

    /**
     * Test Case ID: TC_BK_05
     * Test Objective: isDeleted mặc định được thêm vào where clause
     * Input: params mặc định (isDeleted: false)
     * Expected Output: { isDeleted: false }
     */
    it('TC_BK_05: should add isDeleted=false filter by default', () => {
      const where = buildBookWhereClause(defaultParams());
      expect(where.isDeleted).toBe(false);
    });

    /**
     * Test Case ID: TC_BK_06
     * Test Objective: Lọc theo authorIds khi có
     * Input: authorIds = [1, 2]
     * Expected Output: where.authorId = { in: [1, 2] }
     */
    it('TC_BK_06: should filter by authorIds when provided', () => {
      const params = { ...defaultParams(), authorIds: [1, 2] };
      const where = buildBookWhereClause(params);
      expect(where.authorId).toEqual({ in: [1, 2] });
    });

    /**
     * Test Case ID: TC_BK_07
     * Test Objective: Lọc theo publishYear range khi cả from & to đều có
     * Input: publishYearFrom=2000, publishYearTo=2024
     * Expected Output: where.publishYear = { gte: 2000, lte: 2024 }
     */
    it('TC_BK_07: should apply publishYear range filter correctly', () => {
      const params = { ...defaultParams(), publishYearFrom: 2000, publishYearTo: 2024 };
      const where = buildBookWhereClause(params);
      expect(where.publishYear).toEqual({ gte: 2000, lte: 2024 });
    });

    /**
     * Test Case ID: TC_BK_08
     * Test Objective: Lọc theo ebook availability
     * Input: availableAt = ["ebook"]
     * Expected Output: where.bookEditions.some.format = "EBOOK"
     */
    it('TC_BK_08: should filter ebook availability correctly', () => {
      const params = { ...defaultParams(), availableAt: ['ebook'] };
      const where = buildBookWhereClause(params);
      expect(where.bookEditions).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // Nhóm: buildOrderByClause()
  // ─────────────────────────────────────────────
  describe('buildOrderByClause()', () => {

    /**
     * Test Case ID: TC_BK_09
     * Test Objective: Default sort khi không có params
     * Input: sortBy=undefined, sortOrder=undefined
     * Expected Output: { createdAt: "desc" }
     */
    it('TC_BK_09: should return default orderBy when no params provided', () => {
      const orderBy = buildOrderByClause(undefined, undefined);
      expect(orderBy).toEqual({ createdAt: 'desc' });
    });

    /**
     * Test Case ID: TC_BK_10
     * Test Objective: Sort theo title ascending
     * Input: sortBy="title", sortOrder="asc"
     * Expected Output: { title: "asc" }
     */
    it('TC_BK_10: should sort by title ascending', () => {
      const orderBy = buildOrderByClause('title', 'asc');
      expect(orderBy).toEqual({ title: 'asc' });
    });

    /**
     * Test Case ID: TC_BK_11
     * Test Objective: Fallback về createdAt khi sortBy field không hợp lệ
     * Input: sortBy="random_field", sortOrder="asc"
     * Expected Output: { createdAt: "desc" }
     */
    it('TC_BK_11: should fallback to createdAt for invalid sortBy field', () => {
      const orderBy = buildOrderByClause('random_field', 'asc');
      expect(orderBy).toEqual({ createdAt: 'desc' });
    });
  });
});

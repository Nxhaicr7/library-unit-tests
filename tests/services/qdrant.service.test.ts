const mockQdrantClient = {
  getCollections: jest.fn(),
  createCollection: jest.fn(),
  createPayloadIndex: jest.fn(),
  upsert: jest.fn(),
  search: jest.fn(),
  delete: jest.fn(),
};

const mockPrismaBookFindUnique = jest.fn();
const mockGenerateVector = jest.fn();
const mockUuid = jest.fn(() => 'uuid-fixed');

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => mockQdrantClient),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    book: {
      findUnique: mockPrismaBookFindUnique,
    },
  },
}));

jest.mock('@/services/ollamaEmbedding.service', () => ({
  embeddingService: {
    generateVector: mockGenerateVector,
  },
}));

jest.mock('uuid', () => ({
  v4: () => mockUuid(),
}));

import { qdrantService } from '@/services/qdrant.service';

describe('QdrantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_QDRANT_01: creates collection and payload index when collection is missing', async () => {
    /*
     * Test Case ID: TC_QDRANT_01
     * Test Objective: Khởi tạo collection vector và payload index nếu chưa tồn tại.
     * Input: getCollections() trả về danh sách không chứa library_books_rag
     * Expected Output: createCollection() và createPayloadIndex() được gọi.
     * CheckDB: Verify thao tác lên Qdrant collection/index đúng tên và vector size.
     * Rollback: Toàn bộ client Qdrant được mock, không chạm vector DB thật.
     */
    mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });

    await qdrantService.initCollection();

    expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('library_books_rag', {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    });
    expect(mockQdrantClient.createPayloadIndex).toHaveBeenCalledWith('library_books_rag', {
      field_name: 'book_id',
      field_schema: 'keyword',
    });
  });

  it('TC_QDRANT_02: upserts chunks with generated UUID and book payload', async () => {
    /*
     * Test Case ID: TC_QDRANT_02
     * Test Objective: Đảm bảo dữ liệu vector được đóng gói đúng trước khi ghi vào Qdrant.
     * Input: bookId="10", chunks=[{ text:"abc", vector:[0.1,0.2] }]
     * Expected Output: upsert() được gọi với payload book_id/content đúng chuẩn.
     * CheckDB: Verify request upsert chứa point id, vector, payload chính xác.
     * Rollback: Mock client, không ghi dữ liệu thật.
     */
    await qdrantService.upsertChunks('10', [{ text: 'abc', vector: [0.1, 0.2] }]);

    expect(mockQdrantClient.upsert).toHaveBeenCalledWith('library_books_rag', {
      wait: true,
      points: [
        {
          id: 'uuid-fixed',
          vector: [0.1, 0.2],
          payload: {
            book_id: '10',
            content: 'abc',
          },
        },
      ],
    });
  });

  it('TC_QDRANT_02B: skips collection creation when collection already exists', async () => {
    /*
     * Test Case ID: TC_QDRANT_02B
     * Test Objective: Không tạo trùng collection nếu Qdrant đã có collection sẵn.
     * Input: getCollections() trả về collection library_books_rag
     * Expected Output: createCollection() không được gọi
     * CheckDB: Verify chỉ đọc metadata collection.
     * Rollback: Không thay đổi vector DB thật do client bị mock.
     */
    mockQdrantClient.getCollections.mockResolvedValue({
      collections: [{ name: 'library_books_rag' }],
    });

    await qdrantService.initCollection();

    expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
    expect(mockQdrantClient.createPayloadIndex).not.toHaveBeenCalled();
  });

  it('TC_QDRANT_03: applies book filter when searching similar vectors', async () => {
    /*
     * Test Case ID: TC_QDRANT_03
     * Test Objective: Kiểm tra semantic search theo từng sách dùng đúng filter book_id.
     * Input: queryVector=[1,2], limit=2, filterBookId="12"
     * Expected Output: Kết quả đã map score/content/bookId từ payload.
     * CheckDB: Verify search() dùng filter must.book_id = 12.
     * Rollback: Mock client, không truy cập Qdrant thật.
     */
    mockQdrantClient.search.mockResolvedValue([
      {
        score: 0.91,
        payload: {
          content: 'chunk-1',
          book_id: '12',
        },
      },
    ]);

    await expect(qdrantService.searchSimilar([1, 2], 2, '12')).resolves.toEqual([
      {
        score: 0.91,
        content: 'chunk-1',
        bookId: '12',
      },
    ]);
    expect(mockQdrantClient.search).toHaveBeenCalledWith('library_books_rag', {
      vector: [1, 2],
      limit: 2,
      filter: {
        must: [{ key: 'book_id', match: { value: '12' } }],
      },
      with_payload: true,
    });
  });

  it('TC_QDRANT_03C: searches similar vectors without applying a book filter', async () => {
    /*
     * Test Case ID: TC_QDRANT_03C
     * Test Objective: Bao phủ nhánh search toàn collection khi không truyền filterBookId.
     * Input: queryVector=[9,9], limit=3
     * Expected Output: Kết quả đã map score/content/bookId từ payload.
     * CheckDB: Verify search() không chứa filter book_id.
     * Rollback: Mock client, không truy cập Qdrant thật.
     */
    mockQdrantClient.search.mockResolvedValue([
      {
        score: 0.77,
        payload: {
          content: 'global-chunk',
          book_id: '9',
        },
      },
    ]);

    await expect(qdrantService.searchSimilar([9, 9], 3)).resolves.toEqual([
      {
        score: 0.77,
        content: 'global-chunk',
        bookId: '9',
      },
    ]);
    expect(mockQdrantClient.search).toHaveBeenCalledWith('library_books_rag', {
      vector: [9, 9],
      limit: 3,
      with_payload: true,
    });
  });

  it('TC_QDRANT_03B: deletes vector data for a book by book_id filter', async () => {
    /*
     * Test Case ID: TC_QDRANT_03B
     * Test Objective: Xóa đúng toàn bộ vector gắn với một book_id.
     * Input: bookId = "33"
     * Expected Output: delete() được gọi với filter book_id=33
     * CheckDB: Verify request delete payload đúng.
     * Rollback: Mock client, không xóa dữ liệu thật.
     */
    await qdrantService.deleteBookData('33');

    expect(mockQdrantClient.delete).toHaveBeenCalledWith('library_books_rag', {
      filter: {
        must: [{ key: 'book_id', match: { value: '33' } }],
      },
    });
  });

  it('TC_QDRANT_04: removes soft-deleted books instead of re-indexing them', async () => {
    /*
     * Test Case ID: TC_QDRANT_04
     * Test Objective: Khi sách bị soft delete, vector store phải được xóa thay vì sync lại.
     * Input: prisma.book.findUnique() trả về isDeleted=true
     * Expected Output: delete() được gọi, generateVector() không được gọi.
     * CheckDB: Verify đọc đúng bản ghi book và xóa book_id tương ứng trong Qdrant.
     * Rollback: Prisma/Qdrant đều là mock nên không làm thay đổi dữ liệu thật.
     */
    mockPrismaBookFindUnique.mockResolvedValue({
      id: 15,
      title: 'Deleted Book',
      description: 'desc',
      isDeleted: true,
      bookCategories: [],
    });

    await qdrantService.syncBookToQdrant(15);

    expect(mockQdrantClient.delete).toHaveBeenCalledWith('library_books_rag', {
      filter: {
        must: [{ key: 'book_id', match: { value: '15' } }],
      },
    });
    expect(mockGenerateVector).not.toHaveBeenCalled();
  });

  it('TC_QDRANT_05: rebuilds vector content and re-upserts active books', async () => {
    /*
     * Test Case ID: TC_QDRANT_05
     * Test Objective: Đồng bộ sách đang hoạt động bằng text ghép title/category/description.
     * Input: Book hợp lệ có category và description
     * Expected Output: generateVector() nhận text content chuẩn, delete cũ rồi upsert mới.
     * CheckDB: Verify prisma đọc đúng select, verify delete + upsert cho đúng book_id.
     * Rollback: Prisma/Qdrant/Ollama đều bị mock nên không có side effect.
     */
    mockPrismaBookFindUnique.mockResolvedValue({
      id: 21,
      title: 'Deep Learning',
      description: 'AI fundamentals',
      isDeleted: false,
      bookCategories: [{ category: { name: 'Technology' } }],
    });
    mockGenerateVector.mockResolvedValue([0.5, 0.8]);

    await qdrantService.syncBookToQdrant(21);

    expect(mockGenerateVector).toHaveBeenCalledWith(
      'Title: Deep Learning. Categories: Technology. Description: AI fundamentals'
    );
    expect(mockQdrantClient.delete).toHaveBeenCalled();
    expect(mockQdrantClient.upsert).toHaveBeenCalled();
  });

  it('TC_QDRANT_06: swallows sync errors in non-blocking mode', async () => {
    /*
     * Test Case ID: TC_QDRANT_06
     * Test Objective: Tác vụ nền không được làm hỏng luồng chính nếu sync vector thất bại.
     * Input: syncBookToQdrant() throw error
     * Expected Output: Promise resolve và console.error được gọi.
     * CheckDB: Không có ghi dữ liệu thật vì toàn bộ dependency đã mock.
     * Rollback: Không cần rollback.
     */
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrismaBookFindUnique.mockRejectedValue(new Error('qdrant down'));

    await expect(qdrantService.syncBookToQdrantNonBlocking(30)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('TC_QDRANT_07: throws when syncing a book that does not exist', async () => {
    /*
     * Test Case ID: TC_QDRANT_07
     * Test Objective: Không đồng bộ khi sách không tồn tại trong DB chính.
     * Input: bookId = 999
     * Expected Output: Throw "Book with ID 999 not found"
     * CheckDB: Verify prisma.book.findUnique() được gọi.
     * Rollback: Không có ghi vector vì book không tồn tại.
     */
    mockPrismaBookFindUnique.mockResolvedValue(null);

    await expect(qdrantService.syncBookToQdrant(999)).rejects.toThrow('Book with ID 999 not found');
  });

  it('TC_QDRANT_08: removes book vectors in non-blocking delete flow', async () => {
    /*
     * Test Case ID: TC_QDRANT_08
     * Test Objective: Luồng xóa sách non-blocking phải resolve và gọi deleteBookData.
     * Input: bookId = 45
     * Expected Output: Promise resolve, delete() được gọi với book_id=45
     * CheckDB: Verify request delete chính xác.
     * Rollback: Mock client, không tác động vector DB thật.
     */
    await expect(qdrantService.removeBookFromQdrantNonBlocking(45)).resolves.toBeUndefined();
    expect(mockQdrantClient.delete).toHaveBeenCalledWith('library_books_rag', {
      filter: {
        must: [{ key: 'book_id', match: { value: '45' } }],
      },
    });
  });
});

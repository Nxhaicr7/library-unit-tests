const mockQdrantClient = {
  getCollections: jest.fn(),
  createCollection: jest.fn(),
  createPayloadIndex: jest.fn(),
  upsert: jest.fn(),
  search: jest.fn(),
  delete: jest.fn(),
};

const mockPrismaBookFindUnique = jest.fn();

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => mockQdrantClient),
}));

jest.mock('uuid', () => ({
  v4: () => 'assessment-uuid',
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
    generateVector: jest.fn().mockResolvedValue([0.1, 0.2]),
  },
}));

import { qdrantService } from '@/services/qdrant.service';

describe('Vector Search assessment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_ASM_QDRANT_01: should surface collection creation errors during initialization', async () => {
    mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
    mockQdrantClient.createCollection.mockRejectedValue(new Error('qdrant unavailable'));

    await expect(qdrantService.initCollection()).rejects.toThrow('qdrant unavailable');
  });

  it('TC_ASM_QDRANT_02: should remove vectors for a soft-deleted book', async () => {
    mockPrismaBookFindUnique.mockResolvedValue({
      id: 5,
      title: 'Deleted',
      description: null,
      isDeleted: true,
      bookCategories: [],
    });

    await expect(qdrantService.syncBookToQdrant(5)).resolves.toBeUndefined();
    expect(mockQdrantClient.delete).toHaveBeenCalled();
  });
});

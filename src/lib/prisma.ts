// Stub for Prisma client – replaced by jest.mock() in tests
export const prisma = {
  book: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

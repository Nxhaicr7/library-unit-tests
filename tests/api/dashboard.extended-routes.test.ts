jest.mock('@/lib/prisma', () => ({
  prisma: {
    book: { count: jest.fn() },
    bookItem: { count: jest.fn() },
    user: { count: jest.fn() },
    borrowRecord: { count: jest.fn(), findMany: jest.fn() },
    bookEdition: { count: jest.fn() },
    borrowRequest: { count: jest.fn() },
    payment: { aggregate: jest.fn(), count: jest.fn() },
    borrowBook: { findMany: jest.fn() },
    borrowEbook: { findMany: jest.fn() },
  },
}));

jest.mock('@/middleware/auth.middleware', () => ({
  requireLibrarian: (handler: unknown) => handler,
}));

jest.mock('@/lib/utils', () => ({
  successResponse: (data: unknown, message?: string, status = 200) =>
    Response.json(
      {
        success: true,
        data,
        message,
      },
      { status }
    ),
  handleRouteError: (error: unknown, context = 'API') =>
    Response.json(
      {
        success: false,
        error: error instanceof Error ? `${context}: ${error.message}` : `${context}: unknown`,
      },
      { status: 500 }
    ),
}));

const { prisma: mockPrisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    book: { count: jest.Mock };
    bookItem: { count: jest.Mock };
    user: { count: jest.Mock };
    borrowRecord: { count: jest.Mock; findMany: jest.Mock };
    bookEdition: { count: jest.Mock };
    borrowRequest: { count: jest.Mock };
    payment: { aggregate: jest.Mock; count: jest.Mock };
    borrowBook: { findMany: jest.Mock };
    borrowEbook: { findMany: jest.Mock };
  };
};

import { GET as getStats } from '@/app/api/dashboard/stats/route';
import { GET as getAlerts } from '@/app/api/dashboard/alerts/route';
import { GET as getTopBorrowedBooks } from '@/app/api/dashboard/top-borrowed-books/route';
import { GET as getTopActiveUsers } from '@/app/api/dashboard/top-active-users/route';
import { GET as getBorrowingTrend } from '@/app/api/dashboard/borrowing-trend/route';
import { GET as getUserDistribution } from '@/app/api/dashboard/user-distribution/route';
import { GET as getBookCopiesDistribution } from '@/app/api/dashboard/book-copies-distribution/route';
import { GET as getBorrowRequestDistribution } from '@/app/api/dashboard/borrow-request-distribution/route';
import { BorrowRequestStatus, ItemStatus, Role } from '@prisma/client';

describe('Extended dashboard route coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_DASH_X01: falls back totalRevenue to 0 when aggregate sum is null', async () => {
    mockPrisma.book.count.mockResolvedValue(1);
    mockPrisma.bookItem.count.mockResolvedValue(2);
    mockPrisma.user.count.mockResolvedValue(3);
    mockPrisma.borrowRecord.count.mockResolvedValueOnce(4).mockResolvedValueOnce(5);
    mockPrisma.bookEdition.count.mockResolvedValue(6);
    mockPrisma.borrowRequest.count.mockResolvedValue(7);
    mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const response = await getStats({} as never);
    const body = await response.json();

    expect(body.data.stats.totalRevenue).toBe(0);
  });

  it('TC_DASH_X02: builds zero-state alerts when all counts are zero', async () => {
    mockPrisma.borrowRecord.count.mockResolvedValue(0);
    mockPrisma.borrowRequest.count.mockResolvedValue(0);
    mockPrisma.payment.count.mockResolvedValue(0);
    mockPrisma.bookItem.count.mockResolvedValue(0);

    const response = await getAlerts({} as never);
    const body = await response.json();

    expect(body.data.alerts.map((item: { description: string }) => item.description)).toEqual([
      'No overdue books',
      'No pending borrow requests',
      'No overdue payments',
      'No books need maintenance',
    ]);
  });

  it('TC_DASH_X03: ignores missing book relations when ranking top borrowed books', async () => {
    mockPrisma.borrowBook.findMany.mockResolvedValue([
      { bookItem: { bookId: 1, book: null } },
      {
        bookItem: {
          bookId: 2,
          book: {
            id: 2,
            title: 'Valid Book',
            author: { fullName: 'Author' },
          },
        },
      },
    ]);
    mockPrisma.borrowEbook.findMany.mockResolvedValue([]);

    const response = await getTopBorrowedBooks({} as never);
    const body = await response.json();

    expect(body.data.items).toEqual([
      {
        id: 2,
        title: 'Valid Book',
        subtitle: 'Author',
        value: 1,
        rank: 1,
      },
    ]);
  });

  it('TC_DASH_X04: limits top borrowed books to 10 items', async () => {
    mockPrisma.borrowBook.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        bookItem: {
          bookId: index + 1,
          book: {
            id: index + 1,
            title: `Book ${index + 1}`,
            author: { fullName: `Author ${index + 1}` },
          },
        },
      }))
    );
    mockPrisma.borrowEbook.findMany.mockResolvedValue([]);

    const response = await getTopBorrowedBooks({} as never);
    const body = await response.json();

    expect(body.data.items).toHaveLength(10);
  });

  it('TC_DASH_X05: returns top active users sorted by borrow count', async () => {
    mockPrisma.borrowRecord.findMany.mockResolvedValue([
      { userId: 1, user: { id: 1, fullName: 'Alice', email: 'a@example.com' } },
      { userId: 1, user: { id: 1, fullName: 'Alice', email: 'a@example.com' } },
      { userId: 2, user: { id: 2, fullName: 'Bob', email: 'b@example.com' } },
    ]);

    const response = await getTopActiveUsers({} as never);
    const body = await response.json();

    expect(body.data.items).toEqual([
      { id: 1, title: 'Alice', subtitle: 'a@example.com', value: 2, rank: 1 },
      { id: 2, title: 'Bob', subtitle: 'b@example.com', value: 1, rank: 2 },
    ]);
  });

  it('TC_DASH_X06: builds 7 borrowing trend data points', async () => {
    mockPrisma.borrowRecord.findMany.mockResolvedValue([
      { borrowDate: new Date() },
      { borrowDate: new Date() },
      { borrowDate: new Date() },
    ]);

    const response = await getBorrowingTrend({} as never);
    const body = await response.json();

    expect(body.data.data).toHaveLength(7);
    expect(body.data.timeFilter).toBe('7');
    expect(body.data.data.every((item: { label: string }) => typeof item.label === 'string')).toBe(
      true
    );
  });

  it('TC_DASH_X07: returns role distribution for all three user roles', async () => {
    mockPrisma.user.count
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    const response = await getUserDistribution({} as never);
    const body = await response.json();

    expect(body.data.data).toEqual([
      { label: 'READER', value: 20, color: 'primary.500' },
      { label: 'LIBRARIAN', value: 4, color: 'secondary.500' },
      { label: 'ADMIN', value: 1, color: '#B6B6B8' },
    ]);
    expect(mockPrisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { isDeleted: false, role: Role.READER },
    });
  });

  it('TC_DASH_X08: returns book copy distribution by status', async () => {
    mockPrisma.bookItem.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const response = await getBookCopiesDistribution({} as never);
    const body = await response.json();

    expect(body.data.data).toHaveLength(6);
    expect(mockPrisma.bookItem.count).toHaveBeenNthCalledWith(4, {
      where: { isDeleted: false, status: ItemStatus.MAINTENANCE },
    });
  });

  it('TC_DASH_X09: returns borrow request distribution by status', async () => {
    mockPrisma.borrowRequest.count
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const response = await getBorrowRequestDistribution({} as never);
    const body = await response.json();

    expect(body.data.data.map((item: { label: string }) => item.label)).toEqual([
      'APPROVED',
      'PENDING',
      'REJECTED',
      'FULFILLED',
      'CANCELLED',
      'EXPIRED',
    ]);
    expect(mockPrisma.borrowRequest.count).toHaveBeenNthCalledWith(1, {
      where: { isDeleted: false, status: BorrowRequestStatus.PENDING },
    });
  });

  it('TC_DASH_X10: returns a controlled error response when analytics query throws', async () => {
    /*
     * Test Case ID: TC_DASH_X10
     * Test Objective: Đảm bảo route analytics trả lỗi có kiểm soát thay vì crash khi Prisma lỗi.
     * Input: prisma.borrowRecord.findMany throws Error("db-down")
     * Expected Output: HTTP 500 với payload success=false và context route.
     * CheckDB: Verify route dừng ở nhánh handleRouteError.
     * Rollback: Prisma bị mock, không đọc/ghi DB thật.
     */
    mockPrisma.borrowRecord.findMany.mockRejectedValue(new Error('db-down'));

    const response = await getBorrowingTrend({} as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('GET /api/dashboard/borrowing-trend: db-down');
  });
});

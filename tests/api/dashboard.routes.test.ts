jest.mock('@/lib/prisma', () => ({
  prisma: {
    book: { count: jest.fn() },
    bookItem: { count: jest.fn() },
    user: { count: jest.fn() },
    borrowRecord: { count: jest.fn() },
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
    borrowRecord: { count: jest.Mock };
    bookEdition: { count: jest.Mock };
    borrowRequest: { count: jest.Mock };
    payment: { aggregate: jest.Mock; count: jest.Mock };
    borrowBook: { findMany: jest.Mock };
    borrowEbook: { findMany: jest.Mock };
  };
};

import { GET as getAlerts } from '@/app/api/dashboard/alerts/route';
import { GET as getStats } from '@/app/api/dashboard/stats/route';
import { GET as getTopBorrowedBooks } from '@/app/api/dashboard/top-borrowed-books/route';
import { BorrowRequestStatus, BorrowStatus, ItemStatus } from '@prisma/client';

describe('Dashboard analytics routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_DASH_01: returns aggregated dashboard statistics payload', async () => {
    /*
     * Test Case ID: TC_DASH_01
     * Test Objective: Kiểm tra route stats trả về đủ 8 chỉ số tổng quan cho dashboard.
     * Input: Prisma mock counts/aggregate
     * Expected Output: success=true, data.stats chứa đúng các số liệu đã aggregate
     * CheckDB: Verify từng model count/aggregate được gọi với điều kiện isDeleted/status hợp lệ.
     * Rollback: Prisma bị mock, không truy vấn DB thật.
     */
    mockPrisma.book.count.mockResolvedValue(100);
    mockPrisma.bookItem.count.mockResolvedValue(250);
    mockPrisma.user.count.mockResolvedValue(45);
    mockPrisma.borrowRecord.count
      .mockResolvedValueOnce(13)
      .mockResolvedValueOnce(2);
    mockPrisma.bookEdition.count.mockResolvedValue(30);
    mockPrisma.borrowRequest.count.mockResolvedValue(6);
    mockPrisma.payment.aggregate.mockResolvedValue({
      _sum: { amount: 1500000 },
    });

    const response = await getStats({} as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.stats).toEqual({
      totalBooks: 100,
      totalBookCopies: 250,
      totalUsers: 45,
      activeBorrows: 13,
      overdueBorrows: 2,
      totalEbooks: 30,
      pendingBorrowRequests: 6,
      totalRevenue: 1500000,
    });
    expect(mockPrisma.borrowRecord.count).toHaveBeenNthCalledWith(1, {
      where: {
        isDeleted: false,
        status: BorrowStatus.BORROWED,
      },
    });
    expect(mockPrisma.borrowRequest.count).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        status: BorrowRequestStatus.PENDING,
      },
    });
  });

  it('TC_DASH_02: returns alert cards with correct pluralization and severity', async () => {
    /*
     * Test Case ID: TC_DASH_02
     * Test Objective: Kiểm tra route alerts dựng đúng nội dung cảnh báo cho dashboard.
     * Input: overdue=2, pending=1, overduePayments=0, maintenance=3
     * Expected Output: 4 alert cards với count/severity/description đúng.
     * CheckDB: Verify các truy vấn count sử dụng status phù hợp từng nghiệp vụ.
     * Rollback: Prisma bị mock, không truy cập DB thật.
     */
    mockPrisma.borrowRecord.count.mockResolvedValue(2);
    mockPrisma.borrowRequest.count.mockResolvedValue(1);
    mockPrisma.payment.count.mockResolvedValue(0);
    mockPrisma.bookItem.count.mockResolvedValue(3);

    const response = await getAlerts({} as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.alerts).toEqual([
      {
        id: 1,
        title: 'Overdue Books',
        description: '2 borrows are overdue and need attention',
        count: 2,
        severity: 'error',
      },
      {
        id: 2,
        title: 'Pending Borrow Requests',
        description: '1 borrow request is waiting for approval',
        count: 1,
        severity: 'warning',
      },
      {
        id: 3,
        title: 'Overdue Payments',
        description: 'No overdue payments',
        count: 0,
        severity: 'error',
      },
      {
        id: 4,
        title: 'Books Need Maintenance',
        description: '3 book copies need maintenance',
        count: 3,
        severity: 'info',
      },
    ]);
    expect(mockPrisma.bookItem.count).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        status: ItemStatus.MAINTENANCE,
      },
    });
  });

  it('TC_DASH_03: merges physical and ebook borrows then ranks the top books', async () => {
    /*
     * Test Case ID: TC_DASH_03
     * Test Objective: Dashboard analytics phải gộp hai nguồn mượn sách và sắp xếp top theo count.
     * Input: physical + ebook borrow records có bookId trùng nhau
     * Expected Output: items đã gộp count, sort desc và đánh rank bắt đầu từ 1
     * CheckDB: Verify borrowBook.findMany() và borrowEbook.findMany() đều được gọi.
     * Rollback: Prisma bị mock, không đọc DB thật.
     */
    mockPrisma.borrowBook.findMany.mockResolvedValue([
      {
        bookItem: {
          bookId: 1,
          book: {
            id: 1,
            title: 'Clean Code',
            author: { fullName: 'Robert C. Martin' },
          },
        },
      },
      {
        bookItem: {
          bookId: 1,
          book: {
            id: 1,
            title: 'Clean Code',
            author: { fullName: 'Robert C. Martin' },
          },
        },
      },
      {
        bookItem: {
          bookId: 2,
          book: {
            id: 2,
            title: 'Refactoring',
            author: { fullName: 'Martin Fowler' },
          },
        },
      },
    ]);
    mockPrisma.borrowEbook.findMany.mockResolvedValue([
      {
        bookId: 2,
        book: {
          id: 2,
          title: 'Refactoring',
          author: { fullName: 'Martin Fowler' },
        },
      },
      {
        bookId: 2,
        book: {
          id: 2,
          title: 'Refactoring',
          author: { fullName: 'Martin Fowler' },
        },
      },
    ]);

    const response = await getTopBorrowedBooks({} as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        id: 2,
        title: 'Refactoring',
        subtitle: 'Martin Fowler',
        value: 3,
        rank: 1,
      },
      {
        id: 1,
        title: 'Clean Code',
        subtitle: 'Robert C. Martin',
        value: 2,
        rank: 2,
      },
    ]);
  });
});

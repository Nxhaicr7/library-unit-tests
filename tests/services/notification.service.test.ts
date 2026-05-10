import { ValidationError } from '@/lib/errors';
import { NotificationService } from '@/services/notification.service';
import { JobPriority } from '@/types/queue';
import { NotificationStatus, NotificationType } from '@prisma/client';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('@/queues/notification.queue', () => ({
  addNotificationToQueue: jest.fn(),
  addUrgentNotificationToQueue: jest.fn(),
  addBulkNotificationsToQueue: jest.fn(),
}));

const { prisma: mockPrisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    user: { findUnique: jest.Mock };
    notification: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
};

const mockQueue = jest.requireMock('@/queues/notification.queue') as {
  addNotificationToQueue: jest.Mock;
  addUrgentNotificationToQueue: jest.Mock;
  addBulkNotificationsToQueue: jest.Mock;
};

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_NOTIFY_01: creates a notification after validating the user', async () => {
    /*
     * Test Case ID: TC_NOTIFY_01
     * Test Objective: Xác minh notification được lưu DB với dữ liệu đã trim và trạng thái UNREAD.
     * Input: userId=5, title/message có khoảng trắng đầu cuối
     * Expected Output: notification object từ prisma.notification.create()
     * CheckDB: Verify user.findUnique() và notification.create() được gọi đúng dữ liệu.
     * Rollback: Prisma client bị mock, không ghi DB thật.
     */
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 5,
      email: 'reader@example.com',
      fullName: 'Reader',
    });
    mockPrisma.notification.create.mockResolvedValue({
      id: 100,
      userId: 5,
      title: 'Reminder',
      message: 'Return your book',
      type: NotificationType.REMINDER,
      status: NotificationStatus.UNREAD,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 5,
        email: 'reader@example.com',
        fullName: 'Reader',
      },
    });

    const result = await NotificationService.createNotification({
      userId: 5,
      title: ' Reminder ',
      message: ' Return your book ',
      type: NotificationType.REMINDER,
    });

    expect(result.id).toBe(100);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Reminder',
          message: 'Return your book',
          status: NotificationStatus.UNREAD,
        }),
      })
    );
  });

  it('TC_NOTIFY_02: rejects createNotification when the user does not exist', async () => {
    /*
     * Test Case ID: TC_NOTIFY_02
     * Test Objective: Không tạo notification mồ côi khi user không tồn tại.
     * Input: userId=404
     * Expected Output: throw ValidationError("User not found")
     * CheckDB: Verify notification.create() không được gọi.
     * Rollback: Không có thay đổi dữ liệu vì prisma đã mock.
     */
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      NotificationService.createNotification({
        userId: 404,
        title: 'Alert',
        message: 'Missing user',
        type: NotificationType.ALERT,
      })
    ).rejects.toThrow(new ValidationError('User not found'));
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('TC_NOTIFY_03: queues a notification and returns numeric job ID', async () => {
    /*
     * Test Case ID: TC_NOTIFY_03
     * Test Objective: Đẩy notification vào queue với payload đã được trim.
     * Input: notification data hợp lệ
     * Expected Output: { success:true, notificationId:77 }
     * CheckDB: Verify addNotificationToQueue() nhận payload chuẩn hóa.
     * Rollback: Queue function bị mock, không enqueue job thật.
     */
    mockQueue.addNotificationToQueue.mockResolvedValue('77');

    await expect(
      NotificationService.queueNotification({
        userId: 9,
        title: ' System ',
        message: ' Queue me ',
        type: NotificationType.SYSTEM,
      })
    ).resolves.toEqual({
      success: true,
      notificationId: 77,
    });
    expect(mockQueue.addNotificationToQueue).toHaveBeenCalledWith({
      userId: 9,
      title: 'System',
      message: 'Queue me',
      type: NotificationType.SYSTEM,
    });
  });

  it('TC_NOTIFY_04: returns failure response when queue input is invalid', async () => {
    /*
     * Test Case ID: TC_NOTIFY_04
     * Test Objective: Trả về lỗi có cấu trúc khi request queue thiếu tiêu đề.
     * Input: title = ""
     * Expected Output: { success:false, error:"Notification title is required" }
     * CheckDB: Verify addNotificationToQueue() không được gọi.
     * Rollback: Không có thay đổi dữ liệu.
     */
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await NotificationService.queueNotification({
      userId: 9,
      title: '',
      message: 'Queue me',
      type: NotificationType.SYSTEM,
    });

    expect(result).toEqual({
      success: false,
      error: 'Notification title is required',
    });
    expect(mockQueue.addNotificationToQueue).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('TC_NOTIFY_05: de-duplicates users and maps priority for bulk notifications', async () => {
    /*
     * Test Case ID: TC_NOTIFY_05
     * Test Objective: Queue bulk notifications phải loại user trùng và map đúng JobPriority.
     * Input: userIds=[1,2,2,3], priority="HIGH"
     * Expected Output: success=true, jobIds từ queue mock
     * CheckDB: Verify addBulkNotificationsToQueue() nhận đúng 3 user unique và priority HIGH.
     * Rollback: Queue bị mock, không enqueue job thật.
     */
    mockQueue.addBulkNotificationsToQueue.mockResolvedValue(['job-1', 'job-2', 'job-3']);

    const result = await NotificationService.queueBulkNotifications(
      [1, 2, 2, 3],
      {
        title: 'Library Notice',
        message: 'Please review policy updates',
        type: NotificationType.SYSTEM,
      },
      'HIGH'
    );

    expect(result).toEqual({
      success: true,
      jobIds: ['job-1', 'job-2', 'job-3'],
    });
    expect(mockQueue.addBulkNotificationsToQueue).toHaveBeenCalledWith(
      [
        {
          userId: 1,
          title: 'Library Notice',
          message: 'Please review policy updates',
          type: NotificationType.SYSTEM,
        },
        {
          userId: 2,
          title: 'Library Notice',
          message: 'Please review policy updates',
          type: NotificationType.SYSTEM,
        },
        {
          userId: 3,
          title: 'Library Notice',
          message: 'Please review policy updates',
          type: NotificationType.SYSTEM,
        },
      ],
      JobPriority.HIGH
    );
  });

  it('TC_NOTIFY_05B: queues urgent notifications through the urgent queue path', async () => {
    /*
     * Test Case ID: TC_NOTIFY_05B
     * Test Objective: Notification urgent phải đi đúng queue ưu tiên cao.
     * Input: payload hợp lệ
     * Expected Output: success=true, notificationId từ urgent queue
     * CheckDB: Verify addUrgentNotificationToQueue() nhận payload đã trim.
     * Rollback: Queue bị mock, không enqueue job thật.
     */
    mockQueue.addUrgentNotificationToQueue.mockResolvedValue('101');

    await expect(
      NotificationService.queueUrgentNotification({
        userId: 7,
        title: ' Alert ',
        message: ' Immediate action ',
        type: NotificationType.ALERT,
      })
    ).resolves.toEqual({
      success: true,
      notificationId: 101,
    });
    expect(mockQueue.addUrgentNotificationToQueue).toHaveBeenCalledWith({
      userId: 7,
      title: 'Alert',
      message: 'Immediate action',
      type: NotificationType.ALERT,
    });
  });

  it('TC_NOTIFY_05C: rejects bulk notifications when user list is empty', async () => {
    /*
     * Test Case ID: TC_NOTIFY_05C
     * Test Objective: Chặn enqueue bulk notification khi danh sách người nhận rỗng.
     * Input: userIds=[]
     * Expected Output: success=false
     * CheckDB: Verify addBulkNotificationsToQueue() không được gọi.
     * Rollback: Không enqueue job thật.
     */
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await NotificationService.queueBulkNotifications(
      [],
      {
        title: 'Empty',
        message: 'Nobody',
        type: NotificationType.SYSTEM,
      },
      'LOW'
    );

    expect(result.success).toBe(false);
    expect(mockQueue.addBulkNotificationsToQueue).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('TC_NOTIFY_06: skips update when notification is already marked as read', async () => {
    /*
     * Test Case ID: TC_NOTIFY_06
     * Test Objective: Tránh update dư thừa khi notification đã ở trạng thái READ.
     * Input: notificationId=10, userId=2
     * Expected Output: resolve void, notification.update() không được gọi
     * CheckDB: Verify findFirst() kiểm tra đúng notification/user.
     * Rollback: Prisma bị mock, không đổi trạng thái DB thật.
     */
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: 10,
      status: NotificationStatus.READ,
      userId: 2,
      isDeleted: false,
    });

    await expect(NotificationService.markAsRead(10, 2)).resolves.toBeUndefined();
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it('TC_NOTIFY_07: soft-deletes notifications owned by the current user', async () => {
    /*
     * Test Case ID: TC_NOTIFY_07
     * Test Objective: Đảm bảo thao tác delete chỉ là soft delete.
     * Input: notificationId=11, userId=5
     * Expected Output: notification.update() đặt isDeleted=true
     * CheckDB: Verify findFirst() và update() đúng điều kiện chủ sở hữu.
     * Rollback: Prisma bị mock, không tác động DB thật.
     */
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: 11,
      userId: 5,
      isDeleted: false,
    });
    mockPrisma.notification.update.mockResolvedValue({});

    await expect(NotificationService.deleteNotification(11, 5)).resolves.toBeUndefined();
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { isDeleted: true },
    });
  });

  it('TC_NOTIFY_08: marks all unread notifications as read and returns update count', async () => {
    /*
     * Test Case ID: TC_NOTIFY_08
     * Test Objective: Đánh dấu toàn bộ thông báo chưa đọc thành đã đọc.
     * Input: userId=5
     * Expected Output: count updated = 3
     * CheckDB: Verify updateMany() gọi đúng filter user/status.
     * Rollback: Prisma bị mock, không đổi DB thật.
     */
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await expect(NotificationService.markAllAsRead(5)).resolves.toBe(3);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 5,
        status: NotificationStatus.UNREAD,
        isDeleted: false,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: expect.any(Date),
      },
    });
  });

  it('TC_NOTIFY_09: fetches user notifications with filters and pagination', async () => {
    /*
     * Test Case ID: TC_NOTIFY_09
     * Test Objective: Lấy danh sách thông báo theo filter type/status và phân trang.
     * Input: userId=5, limit=10, offset=5, status=UNREAD, type=SYSTEM
     * Expected Output: Array notifications
     * CheckDB: Verify findMany() gọi đúng options.
     * Rollback: Prisma bị mock, không đọc DB thật.
     */
    const notifications = [{ id: 1 }, { id: 2 }];
    mockPrisma.notification.findMany.mockResolvedValue(notifications);

    await expect(
      NotificationService.getUserNotifications(5, {
        limit: 10,
        offset: 5,
        status: NotificationStatus.UNREAD,
        type: NotificationType.SYSTEM,
      })
    ).resolves.toEqual(notifications);
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: 5,
        isDeleted: false,
        status: NotificationStatus.UNREAD,
        type: NotificationType.SYSTEM,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      skip: 5,
    });
  });

  it('TC_NOTIFY_10: returns unread notification count for a user', async () => {
    /*
     * Test Case ID: TC_NOTIFY_10
     * Test Objective: Đếm số thông báo chưa đọc cho user.
     * Input: userId=5
     * Expected Output: 4
     * CheckDB: Verify count() gọi đúng filter unread.
     * Rollback: Prisma bị mock, không đọc DB thật.
     */
    mockPrisma.notification.count.mockResolvedValue(4);

    await expect(NotificationService.getUnreadCount(5)).resolves.toBe(4);
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({
      where: {
        userId: 5,
        status: NotificationStatus.UNREAD,
        isDeleted: false,
      },
    });
  });
});

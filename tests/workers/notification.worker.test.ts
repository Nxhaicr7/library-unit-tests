const mockCreateNotification = jest.fn();
const mockEmitToUser = jest.fn();

let registeredProcessor: ((job: {
  id: string;
  data: {
    userId: number;
    title: string;
    message: string;
    type: string;
  };
  updateProgress: jest.Mock;
}) => Promise<unknown>) | null = null;

const mockWorkerInstance = {
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/services/notification.service', () => ({
  NotificationService: {
    createNotification: mockCreateNotification,
  },
}));

jest.mock('@/lib/socket-emitter', () => ({
  emitToUser: mockEmitToUser,
}));

jest.mock('@/lib/redis', () => ({
  redisOptions: { host: 'localhost', port: 6379 },
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_queueName: string, processor: unknown) => {
    registeredProcessor = processor as typeof registeredProcessor;
    return mockWorkerInstance;
  }),
  Job: jest.fn(),
}));

describe('Notification worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_NOTIFY_WORKER_01: processes a notification job and emits realtime event', async () => {
    /*
     * Test Case ID: TC_NOTIFY_WORKER_01
     * Test Objective: Bao phủ worker path lưu DB, cập nhật progress và emit WebSocket thành công.
     * Input: BullMQ job hợp lệ
     * Expected Output: success=true, notificationId đúng, progress 10→50→100.
     * CheckDB: Verify createNotification() nhận dữ liệu job và emitToUser() được gọi đúng user.
     * Rollback: Worker, DB và socket đều bị mock.
     */
    const { closeNotificationWorker } = await import('@/workers/notification.worker');

    mockCreateNotification.mockResolvedValue({
      id: 55,
      userId: 7,
      title: 'Reminder',
      message: 'Due soon',
      type: 'REMINDER',
    });
    mockEmitToUser.mockReturnValue(true);

    const updateProgress = jest.fn().mockResolvedValue(undefined);

    const result = await registeredProcessor?.({
      id: 'job-55',
      data: {
        userId: 7,
        title: 'Reminder',
        message: 'Due soon',
        type: 'REMINDER',
      },
      updateProgress,
    });

    expect(result).toEqual({
      success: true,
      notificationId: 55,
      processedAt: expect.any(Number),
    });
    expect(updateProgress).toHaveBeenNthCalledWith(1, 10);
    expect(updateProgress).toHaveBeenNthCalledWith(2, 50);
    expect(updateProgress).toHaveBeenNthCalledWith(3, 100);
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: 7,
      title: 'Reminder',
      message: 'Due soon',
      type: 'REMINDER',
    });
    expect(mockEmitToUser).toHaveBeenCalledWith(
      7,
      'notification',
      expect.objectContaining({ id: 55 })
    );

    await expect(closeNotificationWorker()).resolves.toBeUndefined();
    expect(mockWorkerInstance.close).toHaveBeenCalled();
  });
});

const mockQueueAdd = jest.fn();
const mockQueueBulk = jest.fn();

jest.mock('@/queues/notification.queue', () => ({
  addNotificationToQueue: (...args: unknown[]) => mockQueueAdd(...args),
  addUrgentNotificationToQueue: jest.fn(),
  addBulkNotificationsToQueue: (...args: unknown[]) => mockQueueBulk(...args),
}));

import { NotificationService } from '@/services/notification.service';
import { NotificationType } from '@prisma/client';

describe('Notifications assessment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_ASM_NOTIFY_01: should preserve non-numeric job IDs returned by BullMQ', async () => {
    mockQueueAdd.mockResolvedValue('job-alpha-01');

    await expect(
      NotificationService.queueNotification({
        userId: 1,
        title: 'Notice',
        message: 'Check dashboard',
        type: NotificationType.SYSTEM,
      })
    ).resolves.toEqual({
      success: true,
      notificationId: 'job-alpha-01',
    });
  });

  it('TC_ASM_NOTIFY_02: should de-duplicate recipients in bulk notifications', async () => {
    mockQueueBulk.mockResolvedValue(['a', 'b']);

    const result = await NotificationService.queueBulkNotifications(
      [1, 1, 2],
      {
        title: 'Bulk',
        message: 'Hello',
        type: NotificationType.SYSTEM,
      },
      'LOW'
    );

    expect(result.success).toBe(true);
    expect(mockQueueBulk.mock.calls[0][0]).toHaveLength(2);
  });
});

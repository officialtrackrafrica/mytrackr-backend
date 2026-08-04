import { BadRequestException } from '@nestjs/common';
import { AdminMessagingService } from './admin-messaging.service';

describe('AdminMessagingService', () => {
  it('rejects a non-UUID template identifier before querying PostgreSQL', async () => {
    const templatesRepository = {
      findOne: jest.fn(),
    };
    const service = new AdminMessagingService(
      {} as any,
      templatesRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.composeMessage('admin-id', {
        channel: 'push',
        subject: 'Maintenance notice',
        body: 'The service will be unavailable briefly.',
        templateId: 'notif_broadcast_001',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(templatesRepository.findOne).not.toHaveBeenCalled();
  });
});

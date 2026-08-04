import { AdminMessagingService } from './admin-messaging.service';

describe('AdminMessagingService', () => {
  it('creates and associates a backend-generated template when composing', async () => {
    const templatesRepository = {
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => ({
        id: '3e402fa8-d060-4a44-a240-a2ce65f69176',
        ...value,
      })),
    };
    const messagesRepository = {
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => ({
        id: 'a1efe042-c36d-4864-8684-047bb1011a2f',
        ...value,
      })),
    };
    const usersRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };
    const service = new AdminMessagingService(
      messagesRepository as any,
      templatesRepository as any,
      usersRepository as any,
      {} as any,
      {} as any,
    );

    const result = await service.composeMessage('admin-id', {
      channel: 'push',
      subject: 'Maintenance notice',
      body: 'The service will be unavailable briefly.',
    });

    expect(templatesRepository.save).toHaveBeenCalled();
    expect(messagesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: '3e402fa8-d060-4a44-a240-a2ce65f69176',
      }),
    );
    expect(result.template?.id).toBe('3e402fa8-d060-4a44-a240-a2ce65f69176');
    expect(result.message.templateId).toBe(
      '3e402fa8-d060-4a44-a240-a2ce65f69176',
    );
  });
});

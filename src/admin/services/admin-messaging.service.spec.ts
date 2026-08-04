import { AdminMessagingService } from './admin-messaging.service';
import { NotFoundException } from '@nestjs/common';

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

  it('gets an individual message', async () => {
    const message = { id: 'message-id', subject: 'Notice' };
    const messagesRepository = {
      findOne: jest.fn().mockResolvedValue(message),
    };
    const service = new AdminMessagingService(
      messagesRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getMessage('message-id')).resolves.toBe(message);
    expect(messagesRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'message-id' },
    });
  });

  it('throws when an individual message does not exist', async () => {
    const service = new AdminMessagingService(
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.getMessage('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('patches editable fields on an individual message', async () => {
    const message = {
      id: 'message-id',
      subject: 'Old subject',
      body: 'Existing body',
      status: 'sent',
    };
    const messagesRepository = {
      findOne: jest.fn().mockResolvedValue(message),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const service = new AdminMessagingService(
      messagesRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.updateMessage('message-id', { subject: 'New subject' }),
    ).resolves.toEqual(
      expect.objectContaining({
        subject: 'New subject',
        body: 'Existing body',
        status: 'sent',
      }),
    );
    expect(messagesRepository.save).toHaveBeenCalledWith(message);
  });

  it('permanently deletes an individual message', async () => {
    const message = { id: 'message-id' };
    const messagesRepository = {
      findOne: jest.fn().mockResolvedValue(message),
      remove: jest.fn().mockResolvedValue(message),
    };
    const service = new AdminMessagingService(
      messagesRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.deleteMessage('message-id')).resolves.toEqual({
      message: 'Message deleted successfully',
      id: 'message-id',
    });
    expect(messagesRepository.remove).toHaveBeenCalledWith(message);
  });

  it('moves multiple messages to trash and reports missing IDs', async () => {
    const messages = [
      { id: '0d79e02c-90fd-4de8-b858-786995862852', status: 'sent' },
      { id: '315c2305-0adc-4986-894f-d5e58b18feb0', status: 'draft' },
    ];
    const messagesRepository = {
      findBy: jest.fn().mockResolvedValue(messages),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const service = new AdminMessagingService(
      messagesRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const missingId = 'db91f934-58dc-4767-a309-e79871193e03';

    const result = await service.bulkMoveToTrash([
      messages[0].id,
      messages[1].id,
      missingId,
    ]);

    expect(messages).toEqual([
      expect.objectContaining({ status: 'trash', trashedAt: expect.any(Date) }),
      expect.objectContaining({ status: 'trash', trashedAt: expect.any(Date) }),
    ]);
    expect(messagesRepository.save).toHaveBeenCalledWith(messages);
    expect(result).toEqual(
      expect.objectContaining({
        requested: 3,
        affected: 2,
        notFoundIds: [missingId],
      }),
    );
  });

  it('permanently deletes multiple messages and reports missing IDs', async () => {
    const messages = [
      { id: '0d79e02c-90fd-4de8-b858-786995862852' },
      { id: '315c2305-0adc-4986-894f-d5e58b18feb0' },
    ];
    const messagesRepository = {
      findBy: jest.fn().mockResolvedValue(messages),
      remove: jest.fn().mockResolvedValue(messages),
    };
    const service = new AdminMessagingService(
      messagesRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const missingId = 'db91f934-58dc-4767-a309-e79871193e03';

    const result = await service.bulkDeleteMessages([
      messages[0].id,
      messages[1].id,
      missingId,
    ]);

    expect(messagesRepository.remove).toHaveBeenCalledWith(messages);
    expect(result).toEqual({
      message: 'Messages deleted successfully',
      requested: 3,
      affected: 2,
      ids: messages.map((message) => message.id),
      notFoundIds: [missingId],
    });
  });
});

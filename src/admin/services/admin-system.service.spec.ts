import { NotFoundException } from '@nestjs/common';
import { AdminSystemService } from './admin-system.service';

describe('User support ticket conversation', () => {
  const createdAt = new Date('2026-10-01T10:00:00Z');
  const ticket = {
    id: 'ticket-1',
    userId: 'user-1',
    subject: 'Help with account',
    description: 'Original request',
    category: 'request',
    status: 'in_progress',
    priority: 'medium',
    createdAt,
    updatedAt: createdAt,
  };

  function setup(foundTicket: typeof ticket | null = ticket) {
    const ticketsRepository = {
      findOne: jest.fn().mockResolvedValue(foundTicket),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const ticketRepliesRepository = {
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
      find: jest.fn().mockResolvedValue([
        {
          id: 'reply-1',
          ticketId: ticket.id,
          senderId: 'admin-1',
          senderType: 'admin',
          message: 'We can help',
          attachmentUrl: 'support-ticket-replies/help.pdf',
          createdAt: new Date('2026-10-01T11:00:00Z'),
        },
      ]),
    };
    const participantsQuery = {
      where: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'admin-1', firstName: 'Support', lastName: 'Agent' },
        ]),
    };
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        firstName: 'Test',
        lastName: 'User',
      }),
      createQueryBuilder: jest.fn().mockReturnValue(participantsQuery),
    };
    const storageService = {
      uploadFile: jest.fn().mockResolvedValue('support-ticket-replies/user.pdf'),
      getSignedUrl: jest.fn().mockResolvedValue('https://storage.test/signed'),
    };
    // Avoid opening Redis connections; exercise the actual conversation mapper.
    const service = Object.assign(Object.create(AdminSystemService.prototype), {
      ticketsRepository,
      ticketRepliesRepository,
      usersRepository,
      storageService,
    }) as AdminSystemService;
    return {
      service,
      ticketsRepository,
      ticketRepliesRepository,
      storageService,
    };
  }

  it('returns the original request and saved admin replies with signed attachments', async () => {
    const {
      service,
      ticketsRepository,
      ticketRepliesRepository,
      storageService,
    } = setup();

    const result = await service.getUserSupportTicket('user-1', ticket.id);

    expect(ticketsRepository.findOne).toHaveBeenCalledWith({
      where: { id: ticket.id, userId: 'user-1' },
    });
    expect(ticketRepliesRepository.find).toHaveBeenCalledWith({
      where: { ticketId: ticket.id },
      order: { createdAt: 'ASC' },
    });
    expect(result.messages).toEqual([
      expect.objectContaining({
        senderType: 'user',
        message: 'Original request',
      }),
      expect.objectContaining({
        senderType: 'admin',
        message: 'We can help',
        senderName: 'Support Agent',
        attachmentUrl: 'https://storage.test/signed',
      }),
    ]);
    expect(storageService.getSignedUrl).toHaveBeenCalledWith(
      'support-ticket-replies/help.pdf',
    );
  });

  it('does not load messages when the ticket does not belong to the user', async () => {
    const { service, ticketsRepository, ticketRepliesRepository } = setup(null);

    await expect(
      service.getUserSupportTicket('other-user', ticket.id),
    ).rejects.toThrow(NotFoundException);
    expect(ticketsRepository.findOne).toHaveBeenCalledWith({
      where: { id: ticket.id, userId: 'other-user' },
    });
    expect(ticketRepliesRepository.find).not.toHaveBeenCalled();
  });

  it.each([false, true])('saves an owner reply with attachment=%s and returns the conversation', async (withAttachment) => {
    const { service, ticketsRepository, ticketRepliesRepository, storageService } = setup({ ...ticket });
    const attachment = withAttachment ? { originalname: 'user.pdf' } : undefined;
    const savedReply = {
      id: 'user-reply-1',
      ticketId: ticket.id,
      senderId: ticket.userId,
      senderType: 'user',
      message: 'The issue persists',
      attachmentUrl: withAttachment ? 'support-ticket-replies/user.pdf' : null,
      createdAt: new Date(),
    };
    ticketRepliesRepository.find.mockResolvedValue([savedReply]);

    const result = await service.replyToUserSupportTicket(
      ticket.userId, ticket.id, { message: savedReply.message }, attachment,
    );

    expect(ticketsRepository.findOne).toHaveBeenCalledWith({
      where: { id: ticket.id, userId: ticket.userId },
    });
    expect(ticketRepliesRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      ticketId: ticket.id,
      senderId: ticket.userId,
      senderType: 'user',
      message: savedReply.message,
      attachmentUrl: savedReply.attachmentUrl,
    }));
    expect(result.messages[1]).toEqual(expect.objectContaining({
      senderType: 'user', message: savedReply.message,
      attachmentUrl: withAttachment ? 'https://storage.test/signed' : undefined,
    }));
    expect(ticketsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: ticket.status, updatedAt: expect.any(Date),
    }));
    if (withAttachment) {
      expect(storageService.uploadFile).toHaveBeenCalledWith(attachment, 'support-ticket-replies');
    } else {
      expect(storageService.uploadFile).not.toHaveBeenCalled();
    }
  });

  it('rejects replies to missing or other users tickets before uploading or saving', async () => {
    const { service, ticketsRepository, ticketRepliesRepository, storageService } = setup(null);

    await expect(service.replyToUserSupportTicket(
      'other-user', ticket.id, { message: 'Reply' }, { originalname: 'user.pdf' },
    )).rejects.toThrow(NotFoundException);

    expect(ticketsRepository.findOne).toHaveBeenCalledWith({
      where: { id: ticket.id, userId: 'other-user' },
    });
    expect(storageService.uploadFile).not.toHaveBeenCalled();
    expect(ticketRepliesRepository.save).not.toHaveBeenCalled();
    expect(ticketsRepository.save).not.toHaveBeenCalled();
  });
});

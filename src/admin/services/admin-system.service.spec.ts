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
    };
    const ticketRepliesRepository = {
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
});

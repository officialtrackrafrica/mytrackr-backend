import { AdminUsersService } from './admin-users.service';
import { ForbiddenException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

describe('AdminUsersService', () => {
  const setupExport = (rows: Record<string, unknown>[]) => {
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    const service = new AdminUsersService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, queryBuilder };
  };

  it('exports users with and without subscriptions, escaping CSV and spreadsheet formulas', async () => {
    const { service, queryBuilder } = setupExport([
      {
        id: 'user-1',
        firstName: 'Ada, "Dee"\nSolomon',
        lastName: 'Okafor',
        email: 'ada@example.com',
        planName: 'Solo',
        planSlug: 'solo',
      },
      {
        id: 'user-2',
        firstName: '=1+1',
        lastName: null,
        email: null,
        planName: null,
        planSlug: null,
      },
    ]);

    expect(parse(await service.exportUsers(), { columns: true })).toEqual([
      {
        'User ID': 'user-1',
        'First Name': 'Ada, "Dee"\nSolomon',
        'Last Name': 'Okafor',
        Email: 'ada@example.com',
        'Subscription Plan': 'Solo',
        'Plan Slug': 'solo',
      },
      {
        'User ID': 'user-2',
        'First Name': "'=1+1",
        'Last Name': '',
        Email: '',
        'Subscription Plan': 'No active subscription',
        'Plan Slug': '',
      },
    ]);
    const [, , condition, parameters] = queryBuilder.leftJoin.mock.calls[0];
    expect(condition).toContain('sub.status = :subscriptionStatus');
    expect(condition).toContain('sub."currentPeriodStart" <= :now');
    expect(condition).toContain('sub."currentPeriodEnd" >= :now');
    expect(condition).toContain('LIMIT 1');
    expect(parameters).toEqual({
      subscriptionStatus: 'active',
      now: expect.any(Date),
    });
    expect(queryBuilder.select).toHaveBeenCalledWith('app_user.id', 'id');
  });

  it('exports a header-only CSV when there are no users', async () => {
    const { service } = setupExport([]);
    expect(parse(await service.exportUsers())).toEqual([
      [
        'User ID',
        'First Name',
        'Last Name',
        'Email',
        'Subscription Plan',
        'Plan Slug',
      ],
    ]);
  });

  it('uses a non-reserved query alias for the admin user listing', async () => {
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const usersRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new AdminUsersService(
      usersRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.findAllUsers({});

    expect(usersRepository.createQueryBuilder).toHaveBeenCalledWith('app_user');
    const rawSelections = queryBuilder.addSelect.mock.calls
      .map(([selection]) => selection)
      .filter((selection) => typeof selection === 'string')
      .join('\n');
    expect(rawSelections).toContain('app_user.id');
    expect(rawSelections).not.toMatch(/\buser\.id\b/);
    expect(rawSelections).not.toMatch(/\bappUser\./);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'app_user.createdAt',
      'DESC',
    );
  });

  it.each(['Admin', 'Super Admin'])(
    'does not allow a %s account to be updated through user management',
    async (roleName) => {
      const usersRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: 'admin-id',
          email: 'admin@example.com',
          roles: [{ name: roleName }],
        }),
        save: jest.fn(),
      };
      const service = new AdminUsersService(
        usersRepository as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        service.updateUser('admin-id', { email: 'changed@example.com' }),
      ).rejects.toThrow(ForbiddenException);
      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'admin-id' },
        relations: ['business', 'roles'],
      });
      expect(usersRepository.save).not.toHaveBeenCalled();
    },
  );

  it('emails the reset OTP without returning it to the admin', async () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Ada',
    };
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
    };
    const emailService = {
      sendPasswordResetOtpEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminUsersService(
      usersRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      emailService as any,
    );

    const result = await service.forcePasswordReset(user.id);

    expect(emailService.sendPasswordResetOtpEmail).toHaveBeenCalledWith(
      user.email,
      user.firstName,
      expect.stringMatching(/^\d{6}$/),
      { expiresIn: '1 hour', throwOnError: true },
    );
    expect(result).not.toHaveProperty('resetToken');
    expect(result.message).toBe('Password reset email sent');
  });
});

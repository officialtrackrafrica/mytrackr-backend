import { AdminUsersService } from './admin-users.service';
import { ForbiddenException } from '@nestjs/common';

describe('AdminUsersService', () => {
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
});

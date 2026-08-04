import { AdminUsersService } from './admin-users.service';

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

    expect(usersRepository.createQueryBuilder).toHaveBeenCalledWith('appUser');
    const rawSelections = queryBuilder.addSelect.mock.calls
      .map(([selection]) => selection)
      .filter((selection) => typeof selection === 'string')
      .join('\n');
    expect(rawSelections).toContain('appUser.id');
    expect(rawSelections).not.toMatch(/\buser\.id\b/);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'appUser.createdAt',
      'DESC',
    );
  });
});

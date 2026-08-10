import { AuthService } from './auth.service';
import { AuthError } from '../../common/errors';

describe('AuthService account status enforcement', () => {
  const createService = (user: Record<string, any>) => {
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      update: jest.fn(),
    };
    const sessionService = {
      createSession: jest.fn(),
      isTokenRevoked: jest.fn().mockResolvedValue(false),
    };
    const encryptionService = {
      verifyPassword: jest.fn().mockResolvedValue(true),
    };
    const service = new AuthService(
      usersRepository as any,
      {} as any,
      {} as any,
      sessionService as any,
      encryptionService as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, usersRepository, sessionService, encryptionService };
  };

  it('blocks password login for a suspended user', async () => {
    const { service, sessionService, encryptionService } = createService({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: 'hash',
      isVerified: true,
      isActive: false,
      roles: [{ name: 'User' }],
      securitySettings: {},
    });

    await expect(
      service.loginWithEmail({
        email: 'user@example.com',
        password: 'Password123!',
      }),
    ).rejects.toMatchObject<AuthError>({
      code: 'ACCOUNT_INACTIVE',
      status: 403,
    });
    expect(encryptionService.verifyPassword).not.toHaveBeenCalled();
    expect(sessionService.createSession).not.toHaveBeenCalled();
  });

  it('does not reactivate a suspended user during Google login', async () => {
    const user = {
      id: 'user-id',
      isVerified: true,
      isActive: false,
      roles: [{ name: 'User' }],
    };
    const { service, usersRepository, sessionService } = createService(user);

    await expect(service.googleLogin(user as any)).rejects.toMatchObject<AuthError>(
      {
        code: 'ACCOUNT_INACTIVE',
        status: 403,
      },
    );
    expect(usersRepository.update).not.toHaveBeenCalled();
    expect(sessionService.createSession).not.toHaveBeenCalled();
  });
});

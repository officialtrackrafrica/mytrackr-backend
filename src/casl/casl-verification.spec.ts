import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { RolesService } from '../auth/services/roles.service';
import { CaslAbilityFactory } from './casl-ability.factory';
import { Action } from './action.enum';
import { INestApplication } from '@nestjs/common';
import { User } from '../auth/entities/user.entity';

describe('CASL Verification', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let rolesService: RolesService;
  let caslAbilityFactory: CaslAbilityFactory;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    rolesService = app.get<RolesService>(RolesService);
    caslAbilityFactory = app.get<CaslAbilityFactory>(CaslAbilityFactory);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow Super Admin to manage all', async () => {
    const superAdminRole = (await rolesService.findAll()).find(
      (r) => r.name === 'Super Admin',
    );

    expect(superAdminRole).toBeDefined();

    const user = new User();
    user.id = 'test-super-admin';
    user.roles = [superAdminRole!];

    const ability = caslAbilityFactory.createForUser(user);

    expect(ability.can(Action.Manage, 'all')).toBe(true);
    expect(ability.can(Action.Delete, 'User')).toBe(true);
  });

  it('should deny User from deleting User', async () => {
    const userRole = (await rolesService.findAll()).find(
      (r) => r.name === 'User',
    );
    expect(userRole).toBeDefined();

    const user = new User();
    user.id = 'test-user';
    user.roles = [userRole!];

    const ability = caslAbilityFactory.createForUser(user);

    expect(ability.can(Action.Delete, 'User')).toBe(false);
  });

  it('should allow User to read User', async () => {
    const userRole = (await rolesService.findAll()).find(
      (r) => r.name === 'User',
    );
    expect(userRole).toBeDefined();

    const user = new User();
    user.id = 'test-user-read';
    user.roles = [userRole!];

    const ability = caslAbilityFactory.createForUser(user);

    expect(ability.can(Action.Read, 'User')).toBe(true);
  });
});

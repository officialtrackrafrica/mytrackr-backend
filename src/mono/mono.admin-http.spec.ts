import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Script, runInNewContext } from 'node:vm';
import { MonoAdminController } from './mono-admin.controller';
import { MonoService } from './mono.service';
import { AdminCalculationAuditController } from '../admin/controllers/admin-calculation-audit.controller';
import { AdminCalculationAuditService } from '../admin/services/admin-calculation-audit.service';
import { JwtAuthGuard } from '../auth/guards';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';

describe('Admin sync HTTP smoke test', () => {
  let app: INestApplication;
  const userId = '7d86faea-7aae-447a-93a8-810678ef38ce';
  const snapshot = {
    userId,
    accounts: [{ accountId: 'mono-1', transactionCount: 4 }],
  };
  const mono = {
    testAdminUserSync: jest.fn().mockResolvedValue({
      userId,
      before: snapshot,
      after: snapshot,
      results: [{ accountId: 'mono-1', status: 'processing' }],
    }),
    getAdminUserSyncStatus: jest.fn().mockResolvedValue(snapshot),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MonoAdminController, AdminCalculationAuditController],
      providers: [
        CaslAbilityFactory,
        { provide: MonoService, useValue: mono },
        {
          provide: AdminCalculationAuditService,
          useValue: {
            getUsersWithLinkedAccounts: jest.fn().mockResolvedValue([
              {
                id: userId,
                firstName: '<script>alert(1)</script>',
                business: { name: 'Test business' },
              },
            ]),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        // Stub only authentication; run the real policy guard and CASL permissions.
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers['x-test-role']) throw new UnauthorizedException();
          req.user = {
            id: 'test-admin',
            roles: [{ name: req.headers['x-test-role'] }],
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the admin controls and valid inline JavaScript, escaping user labels', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/calculation-audit')
      .set('x-test-role', 'Admin')
      .expect(200)
      .expect('Content-Type', /html/);
    expect(response.text).toContain('Sync selected user');
    expect(response.text).toContain('Check saved results');
    expect(response.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    const scripts = [
      ...response.text.matchAll(/<script>([\s\S]*?)<\/script>/g),
    ];
    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0][1])).not.toThrow();
  });

  it('routes a refresh to the selected user and exposes a read-only snapshot', async () => {
    const response = await request(app.getHttpServer())
      .post(`/admin/mono/users/${userId}/sync`)
      .set('x-test-role', 'Admin')
      .expect(200);
    expect(response.body.results[0].status).toBe('processing');
    expect(mono.testAdminUserSync).toHaveBeenCalledWith(userId);
    const read = await request(app.getHttpServer())
      .get(`/admin/mono/users/${userId}/sync`)
      .set('x-test-role', 'Admin')
      .expect(200);
    expect(read.body.accounts[0].transactionCount).toBe(4);
    expect(mono.getAdminUserSyncStatus).toHaveBeenCalledWith(userId);
  });

  it('runs the page buttons and renders processing and saved results', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/calculation-audit')
      .set('x-test-role', 'Admin')
      .expect(200);
    const script = [
      ...response.text.matchAll(/<script>([\s\S]*?)<\/script>/g),
    ][0][1];
    const element = () => ({
      value: '',
      disabled: false,
      textContent: '',
      children: [] as any[],
      listeners: {} as Record<string, () => Promise<void>>,
      addEventListener(name: string, callback: any) {
        this.listeners[name] = callback;
      },
      appendChild(child: any) {
        this.children.push(child);
      },
      replaceChildren(...children: any[]) {
        this.children = children;
      },
    });
    const user = element();
    user.value = userId;
    const run = element();
    const check = element();
    const message = element();
    const output = element();
    const nodes = {
      'sync-run': run,
      'sync-check': check,
      'sync-message': message,
      'sync-results': output,
    };
    const cells: any[] = [];
    const row = () => ({
      ...element(),
      insertCell() {
        const cell = element();
        cells.push(cell);
        return cell;
      },
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          before: snapshot,
          after: snapshot,
          results: [{ accountId: 'mono-1', status: 'processing' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot });
    runInNewContext(script, {
      document: {
        querySelector: () => user,
        getElementById: (id: keyof typeof nodes) => nodes[id],
        createElement: () => ({
          ...element(),
          createTHead: () => ({ insertRow: row }),
          createTBody: () => ({ insertRow: row }),
        }),
      },
      window: { location: { pathname: '/api/admin/calculation-audit' } },
      fetch: fetchMock,
    });
    await run.listeners.click();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/admin/mono/users/${userId}/sync`,
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
    expect(message.textContent).toContain('processing');
    expect(cells.some((cell) => cell.textContent === 'processing')).toBe(true);
    expect(run.disabled).toBe(false);
    await check.listeners.click();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/admin/mono/users/${userId}/sync`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(message.textContent).toContain('Saved results loaded');
  });

  it('rejects malformed user IDs', async () => {
    await request(app.getHttpServer())
      .post('/admin/mono/users/not-a-uuid/sync')
      .set('x-test-role', 'Admin')
      .expect(400);
  });

  it.each(['get', 'post'] as const)(
    'denies unauthenticated and non-admin %s requests',
    async (method) => {
      await request(app.getHttpServer())
        [method](`/admin/mono/users/${userId}/sync`)
        .expect(401);
      await request(app.getHttpServer())
        [method](`/admin/mono/users/${userId}/sync`)
        .set('x-test-role', 'User')
        .expect(403);
    },
  );
});

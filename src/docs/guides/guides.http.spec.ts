import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Script } from 'node:vm';
import { GuidesController } from '../controllers/guides.controller';
import { guides, serverSenderSource } from './guide-content';

describe('Public server-rendered integration guides', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GuidesController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app?.close());

  it('renders the guide centre without signing in and links every platform', async () => {
    const response = await request(app.getHttpServer())
      .get('/developers/guides')
      .expect(200)
      .expect('Content-Type', /html/);
    expect(response.text).toContain('A guide for every');
    expect(response.text).toContain('/developers/assets/mytrackr-logo.png');
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    for (const guide of guides)
      expect(response.text).toContain(`/developers/guides/${guide.slug}`);
    expect(response.text.toLowerCase()).not.toContain('dummy');
  });

  it.each(guides.map((guide) => guide.slug))(
    'renders all steps and safe copy controls for %s',
    async (slug) => {
      const guide = guides.find((item) => item.slug === slug)!;
      const response = await request(app.getHttpServer())
        .get(`/developers/guides/${slug}`)
        .expect(200)
        .expect('Content-Type', /html/);
      for (const section of guide.sections)
        expect(response.text).toContain(`id="${section.id}"`);
      expect(response.text).toContain('On this page');
      const scripts = [
        ...response.text.matchAll(
          /<script nonce="([^"]+)">([\s\S]*?)<\/script>/g,
        ),
      ];
      expect(scripts).toHaveLength(1);
      expect(response.headers['content-security-policy']).toContain(
        `nonce-${scripts[0][1]}`,
      );
      expect(() => new Script(scripts[0][2])).not.toThrow();
      expect(response.text).not.toContain('name="otp"');
      expect(response.text.toLowerCase()).not.toContain('dummy');
    },
  );

  it('searches by platform with server-rendered results', async () => {
    const response = await request(app.getHttpServer())
      .get('/developers/guides?q=flutter')
      .expect(200);
    expect(response.text).toContain('Results for');
    expect(response.text).toContain('Connect a Flutter app');
    expect(response.text.match(/class="guide-card"/g)).toHaveLength(1);
  });

  it('escapes search text and handles no results', async () => {
    const response = await request(app.getHttpServer())
      .get('/developers/guides')
      .query({ q: '<img src=x onerror=alert(1)>' })
      .expect(200);
    expect(response.text).toContain('&lt;img');
    expect(response.text).not.toContain('<img src=x');
    expect(response.text).toContain('No matching guides');
  });

  it('rejects oversized and non-scalar search values', async () => {
    await request(app.getHttpServer())
      .get('/developers/guides')
      .query({ q: 'x'.repeat(121) })
      .expect(400);
    await request(app.getHttpServer())
      .get('/developers/guides?q=vue&q=react')
      .expect(400);
  });

  it('serves a useful HTML 404 for unknown guides', async () => {
    const response = await request(app.getHttpServer())
      .get('/developers/guides/not-a-platform')
      .expect(404)
      .expect('Content-Type', /html/);
    expect(response.text).toContain('That guide could not be found');
  });

  it('ships the logo and controlled public assets without allowing arbitrary files', async () => {
    const response = await request(app.getHttpServer())
      .get('/developers/assets/mytrackr-logo.png')
      .expect(200)
      .expect('Content-Type', /image\/png/);
    expect(response.body.subarray(0, 8).toString('hex')).toBe(
      '89504e470d0a1a0a',
    );
    await request(app.getHttpServer())
      .get('/developers/assets/guides.css')
      .expect(200)
      .expect('Content-Type', /css/);
    await request(app.getHttpServer())
      .get('/developers/assets/.env')
      .expect(404);
    await request(app.getHttpServer())
      .get('/developers/assets/guide-content.ts')
      .expect(404);
  });

  it('keeps client examples free of embedded merchant credentials and documents the backend contract', () => {
    for (const slug of ['react', 'vue', 'flutter']) {
      const guide = guides.find((item) => item.slug === slug)!;
      const source = guide.sections.map((section) => section.html).join('');
      expect(source).toContain('/api/orders/');
      expect(source).toContain('/developers/guides/server');
      expect(source).not.toContain('x-mytrackr-api-key');
    }
    expect(serverSenderSource).toContain('process.env.MYTRACKR_API_KEY');
    expect(serverSenderSource).toContain(
      "externalId: 'store:' + order.id + ':paid'",
    );
  });
});

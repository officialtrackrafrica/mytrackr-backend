import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthErrorFilter } from '../src/common/filters';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AuthErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/login (POST)', () => {
    it('should reject invalid login method', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          method: 'invalid',
          identifier: 'test@example.com',
          credential: 'password123',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject missing credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          method: 'email',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          method: 'email',
          identifier: 'nonexistent@example.com',
          credential: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'INVALID_CREDENTIALS');
    });
  });

  describe('/auth/refresh (POST)', () => {
    it('should reject invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject missing refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  describe('/auth/sessions (GET)', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/auth/sessions').expect(401);
    });
  });

  describe('/auth/sessions/logout-all (POST)', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/sessions/logout-all')
        .expect(401);
    });
  });
});

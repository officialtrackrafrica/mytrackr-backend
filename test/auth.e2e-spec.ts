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

  describe('/auth/login/email (POST)', () => {
    it('should login successfully with valid email credentials', async () => {
      // Assuming seed data: admin@mytrackr.com / SuperSecretAdmin123!
      const response = await request(app.getHttpServer())
        .post('/auth/login/email')
        .send({
          email: 'admin@mytrackr.com',
          password: 'SuperSecretAdmin123!',
        })
        .expect(201); // NestJS default for POST is 201

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('admin@mytrackr.com');
    });

    it('should reject missing credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/email')
        .send({
          email: 'admin@mytrackr.com',
        })
        .expect(400); // Validation error
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login/email')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'INVALID_CREDENTIALS');
    });

    it('should return 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/email')
        .send({
          email: 'admin@mytrackr.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });

  describe('/auth/login/phone (POST)', () => {
    it('should reject missing credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/phone')
        .send({
          phone: '+1234567890',
        })
        .expect(400);
    });

    it('should return 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login/phone')
        .send({
          phone: '+1000000000',
          password: 'password123',
        })
        .expect(401);
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

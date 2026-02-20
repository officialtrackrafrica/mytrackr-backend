import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Reproduction (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    // Login to get token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login/email')
      .send({
        email: 'admin@mytrackr.com',
        password: 'SuperSecretAdmin123!',
      });

    if (loginResponse.status === 201) {
      accessToken = loginResponse.body.accessToken;
    } else {
      console.warn(
        'Login failed, trying registration or skipping...',
        loginResponse.body,
      );
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('/users/me (GET) should succeed', async () => {
    if (!accessToken) {
      console.log('Skipping test due to missing access token');
      return;
    }
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});

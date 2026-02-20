import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('User Update Fix Verification (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let testEmail: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    // Use a unique email/googleId to avoid collisions
    const uniqueId = Date.now();
    testEmail = `test_fix_${uniqueId}@example.com`;

    // 1. Register a new user using Google method (bypasses OTP)
    // This allows us to get a token immediately without manual DB manipulation
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register/google')
      .send({
        googleIdToken: `mock_token_${uniqueId}`,
        firstName: 'Test',
        lastName: 'User',
      });

    if (registerResponse.status === 201) {
      accessToken = registerResponse.body.accessToken;
      console.log('Registration successful, token obtained');
    } else {
      console.error('Registration failed:', registerResponse.body);
      // We throw here to fail fast
      throw new Error('Failed to register test user');
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('PATCH /users/me should return 200 OK for regular user', async () => {
    if (!accessToken) {
      throw new Error('No access token available for test');
    }

    // 2. Try to update profile
    const updateResponse = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'UpdatedName',
      });

    console.log('Update Response Status:', updateResponse.status);
    console.log('Update Response Body:', updateResponse.body);

    if (updateResponse.status !== 200) {
      throw new Error(
        `Expected 200 OK but got ${updateResponse.status}. Body: ${JSON.stringify(updateResponse.body)}`,
      );
    } else {
      const body = updateResponse.body;
      if (body.firstName !== 'UpdatedName') {
        throw new Error(
          `Expected firstName to be 'UpdatedName' but got '${body.firstName}'`,
        );
      }
    }
  });
});

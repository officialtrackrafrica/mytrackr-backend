/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('User Update Fix Verification (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const testEmail = `test_fix_${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    // 1. Register a new user
    // This tests the "assign role" logic implicitly if we check the DB,
    // but primarily we need a token for a fresh "User"
    // Using registerWithEmail which sends an OTP.
    // Wait, registerWithEmail returns { success: true, requiresVerification: true }
    // We then need to verify... this is complicated for a quick test.
    // Does registerWithGoogle work? It mocks Google verification and returns tokens immediately!

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register/google') // using google to bypass OTP flow
      .send({
        googleIdToken: `mock_token_${Date.now()}`,
        firstName: 'Test',
        lastName: 'User',
      });

    if (registerResponse.status === 201) {
      accessToken = registerResponse.body.accessToken;
      console.log('Registration successful, token obtained');
    } else {
      console.error('Registration failed:', registerResponse.body);
    }
  });

  afterAll(async () => {
    await app.close();
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
    }
  });
});

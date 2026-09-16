import { ConfigService } from '@nestjs/config';
import { DatabaseConfigService } from './database.config';

describe('DatabaseConfigService', () => {
  it('prefers DATABASE_URL and enables TLS by default', () => {
    const config = new ConfigService({
      DATABASE_URL: 'postgresql://user:password@db.example.com:6543/postgres',
    });

    const options = new DatabaseConfigService(config).createTypeOrmOptions();

    expect(options).toMatchObject({
      type: 'postgres',
      url: 'postgresql://user:password@db.example.com:6543/postgres',
      ssl: { rejectUnauthorized: true },
    });
    expect(options).not.toHaveProperty('host');
  });

  it('retains individual connection settings when DATABASE_URL is absent', () => {
    const config = new ConfigService({
      DATABASE_HOST: 'db',
      DATABASE_PORT: 5436,
      DATABASE_USERNAME: 'mytrackr',
      DATABASE_PASSWORD: 'secret',
      DATABASE_NAME: 'mytrackr_test',
    });

    const options = new DatabaseConfigService(config).createTypeOrmOptions();

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db',
      port: 5436,
      username: 'mytrackr',
      password: 'secret',
      database: 'mytrackr_test',
      ssl: false,
    });
    expect(options).not.toHaveProperty('url');
  });
});

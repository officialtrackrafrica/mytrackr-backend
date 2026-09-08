import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
}));

describe('StorageService', () => {
  const createService = () =>
    new StorageService({
      get: jest.fn((key: string) => {
        switch (key) {
          case 'FILEBASE_BUCKET_NAME':
            return 'mytrackr';
          case 'FILEBASE_ACCESS_KEY':
            return 'access-key';
          case 'FILEBASE_SECRET_KEY':
            return 'secret-key';
          default:
            return undefined;
        }
      }),
    } as any);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('stores the object key after a successful upload', async () => {
    const service = createService();
    jest.spyOn(Date, 'now').mockReturnValue(1788868076342);
    jest.spyOn((service as any).s3Client, 'send').mockResolvedValue({});

    const result = await service.uploadFile(
      {
        originalname: 'customer photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('image'),
      },
      'support-tickets',
    );

    expect(result).toBe('support-tickets/1788868076342-customer_photo.jpg');
  });

  it.each([
    [
      'https://mytrackr.s3.filebase.com/support-tickets/123-photo.jpg',
      'support-tickets/123-photo.jpg',
    ],
    [
      'https://s3.filebase.com/mytrackr/support-tickets/123-photo.jpg',
      'support-tickets/123-photo.jpg',
    ],
    ['support-tickets/123-photo.jpg', 'support-tickets/123-photo.jpg'],
  ])('signs legacy URLs and stored keys', async (storedValue, expectedKey) => {
    const service = createService();

    await expect(service.getSignedUrl(storedValue)).resolves.toBe(
      'https://signed.example/file',
    );

    const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
    expect(command.input).toMatchObject({
      Bucket: 'mytrackr',
      Key: expectedKey,
    });
  });
});

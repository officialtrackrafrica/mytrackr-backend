import { lookup } from 'node:dns/promises';
import {
  integrationUrl,
  isPublicAddress,
  publicWebhookAgent,
} from './integration-url-security';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

describe('Outbound webhook network protection', () => {
  afterEach(() => jest.resetAllMocks());
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '2001:db8::1',
    '2002:7f00:1::',
  ])('blocks non-public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => expect(isPublicAddress(address)).toBe(true),
  );
  it.each([
    'http://example.com/hook',
    'https://user:pass@example.com/hook',
    'https://localhost/hook',
    'https://127.1/hook',
    'https://2130706433/hook',
    'https://[::1]/hook',
    'https://example.com:8080/hook',
    'https://metadata.internal/hook',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => integrationUrl(url, 'webhook')).toThrow();
  });
  it('normalizes origins and rejects origin paths and credentials', () => {
    expect(integrationUrl('https://EXAMPLE.com/', 'origin')).toBe(
      'https://example.com',
    );
    expect(() =>
      integrationUrl('https://example.com/path', 'origin'),
    ).toThrow();
    expect(() =>
      integrationUrl('https://user@example.com/', 'origin'),
    ).toThrow();
  });
  it('rejects a DNS name resolving to any private address, including mixed answers', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(
      publicWebhookAgent('https://hooks.example.com/'),
    ).rejects.toThrow('non-public');
  });
  it('pins the socket lookup to the vetted public address', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
    ]);
    const agent = await publicWebhookAgent('https://hooks.example.com/');
    const callback = jest.fn();
    (agent.options.lookup as any)('hooks.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(lookup).toHaveBeenCalledTimes(1);
    agent.destroy();
  });
});

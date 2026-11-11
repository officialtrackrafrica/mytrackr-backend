import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Agent } from 'node:https';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  if (isIP(address) === 6) {
    // Only globally routed unicast. Excludes loopback, local, mapped and NAT64.
    return (
      /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address, 'ipv6')
    );
  }
  return false;
}

export function integrationUrl(
  value: string,
  kind: 'origin' | 'redirect' | 'webhook',
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException(`Enter a valid ${kind} URL.`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const localDevelopment =
    process.env.NODE_ENV !== 'production' &&
    kind !== 'webhook' &&
    ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (
    (url.protocol !== 'https:' &&
      !(localDevelopment && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443' && !localDevelopment) ||
    url.hash
  ) {
    throw new BadRequestException(
      `${kind} URLs must use HTTPS without credentials, fragments, or custom ports.`,
    );
  }
  if (kind === 'origin' && (url.pathname !== '/' || url.search))
    throw new BadRequestException(
      'Allowed origins must contain only the scheme and host.',
    );
  if (
    kind === 'webhook' &&
    (hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      (!hostname.includes('.') && !isIP(hostname)) ||
      (isIP(hostname) && !isPublicAddress(hostname)))
  ) {
    throw new BadRequestException(
      'Webhook URLs must point to a public HTTPS endpoint.',
    );
  }
  return kind === 'origin' ? url.origin : url.href;
}

// Resolve once and pin the connection to the vetted address. Recheck on every delivery.
export async function publicWebhookAgent(value: string): Promise<Agent> {
  const url = new URL(integrationUrl(value, 'webhook'));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolveWithDeadline(hostname);
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new BadRequestException(
      'Webhook host resolved to a non-public address.',
    );
  return new Agent({
    lookup: ((
      _host: string,
      options: { all?: boolean },
      callback: (...args: any[]) => void,
    ) => {
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    }) as any,
  });
}

async function resolveWithDeadline(hostname: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(new BadRequestException('Webhook DNS lookup timed out.')),
          5000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

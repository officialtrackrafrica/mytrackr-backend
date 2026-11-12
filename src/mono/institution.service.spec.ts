import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InstitutionService } from './institution.service';

describe('InstitutionService', () => {
  const bank = {
    _id: 'bank-personal',
    name: 'Example Bank',
    type: 'PERSONAL_BANKING',
    country: 'ng',
    nip_code: '000001',
    auth_methods: [{ type: 'internet_banking' }],
  };
  let service: InstitutionService;
  let request: jest.SpyInstance;

  beforeEach(() => {
    service = new InstitutionService({ get: () => 'secret' } as any);
    request = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'successful', data: [bank] }),
    } as Response);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns only usable financial-data institution/category pairs', async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'successful',
        data: [bank, null, { ...bank, auth_methods: [] }],
      }),
    } as Response);
    expect(await service.getSupportedInstitutions()).toEqual([
      {
        institutionId: 'bank-personal',
        name: 'Example Bank',
        accountType: 'PERSONAL_BANKING',
        country: 'ng',
        bankCode: '000001',
        authMethods: ['internet_banking'],
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      'https://api.withmono.com/v3/institutions?scope=financial_data',
      expect.objectContaining({
        headers: { 'mono-sec-key': 'secret', accept: 'application/json' },
      }),
    );
  });

  it('accepts a supported pair and rejects a different category for the same bank', async () => {
    expect(
      await service.assertSupported('bank-personal', 'PERSONAL_BANKING'),
    ).toMatchObject({ institutionId: 'bank-personal' });
    await expect(
      service.assertSupported('bank-personal', 'BUSINESS_BANKING'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertSupported('unknown', 'PERSONAL_BANKING'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes the live Mono id/institution format for listing and checkout', async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'successful',
        data: [
          {
            id: 'live-bank',
            institution: 'Live Bank',
            type: 'PERSONAL_BANKING',
            country: 'ng',
            nip_code: '000015',
            auth_methods: [{ type: 'mobile_banking', name: 'Mobile Banking' }],
          },
          bank,
        ],
      }),
    } as Response);

    const institutions = await service.getSupportedInstitutions();
    expect(institutions).toHaveLength(2);
    expect(institutions[1]).toEqual({
      institutionId: 'live-bank',
      name: 'Live Bank',
      accountType: 'PERSONAL_BANKING',
      country: 'ng',
      bankCode: '000015',
      authMethods: ['mobile_banking'],
    });
    await expect(
      service.assertSupported('live-bank', 'PERSONAL_BANKING'),
    ).resolves.toEqual(institutions[1]);
  });

  it.each([
    [undefined, undefined],
    ['', 'PERSONAL_BANKING'],
    ['bank-personal', ' '],
  ])(
    'rejects incomplete selections without contacting Mono (%s, %s)',
    async (id, type) => {
      await expect(service.assertSupported(id, type)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ok: false },
    { ok: true, json: async () => ({ status: 'successful', data: {} }) },
    { ok: true, json: async () => ({ status: 'failed', data: [bank] }) },
  ])('fails closed when Mono cannot confirm coverage', async (response) => {
    request.mockResolvedValue(response as Response);
    await expect(
      service.assertSupported('bank-personal', 'PERSONAL_BANKING'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('handles network failures and timeouts without exposing provider errors', async () => {
    request.mockRejectedValue(new Error('private provider details'));
    await expect(service.getSupportedInstitutions()).rejects.toThrow(
      'Bank support cannot be checked right now',
    );
  });

  it('rejects missing configuration without a request', async () => {
    service = new InstitutionService({ get: () => undefined } as any);
    await expect(service.getSupportedInstitutions()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request).not.toHaveBeenCalled();
  });
});

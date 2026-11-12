import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportedInstitutionDto } from './dto/supported-institution.dto';

@Injectable()
export class InstitutionService {
  constructor(private readonly config: ConfigService) {}

  async getSupportedInstitutions(): Promise<SupportedInstitutionDto[]> {
    const key = this.config.get<string>('MONO_SECRET_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'Bank support cannot be checked right now',
      );
    }

    try {
      const response = await fetch(
        'https://api.withmono.com/v3/institutions?scope=financial_data',
        {
          headers: { 'mono-sec-key': key, accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error('Institution lookup failed');
      const payload = await response.json();
      if (payload.status !== 'successful' || !Array.isArray(payload.data)) {
        throw new Error('Invalid institution response');
      }

      return payload.data
        .map((bank: any) =>
          bank
            ? {
                ...bank,
                _id: bank.id ?? bank._id,
                name: bank.institution ?? bank.name,
              }
            : bank,
        )
        .filter(
          (bank: any) =>
            bank &&
            typeof bank._id === 'string' &&
            bank._id.trim() &&
            typeof bank.name === 'string' &&
            bank.name.trim() &&
            typeof bank.type === 'string' &&
            bank.type.trim() &&
            Array.isArray(bank.auth_methods) &&
            bank.auth_methods.some(
              (method: any) =>
                typeof method?.type === 'string' && method.type.trim(),
            ),
        )
        .map((bank: any) => ({
          institutionId: bank._id,
          name: bank.name,
          accountType: bank.type,
          authMethods: bank.auth_methods
            .filter(
              (method: any) =>
                typeof method?.type === 'string' && method.type.trim(),
            )
            .map((method: any) => method.type),
          country: typeof bank.country === 'string' ? bank.country : undefined,
          bankCode:
            typeof bank.nip_code === 'string' ? bank.nip_code : undefined,
          icon: typeof bank.icon === 'string' ? bank.icon : undefined,
        }))
        .sort(
          (a: SupportedInstitutionDto, b: SupportedInstitutionDto) =>
            a.name.localeCompare(b.name) ||
            a.accountType.localeCompare(b.accountType),
        );
    } catch {
      throw new ServiceUnavailableException(
        'Bank support cannot be checked right now. Please try again before subscribing.',
      );
    }
  }

  async assertSupported(institutionId?: string, accountType?: string) {
    if (
      typeof institutionId !== 'string' ||
      !institutionId.trim() ||
      typeof accountType !== 'string' ||
      !accountType.trim()
    ) {
      throw new BadRequestException(
        'Select a supported bank and account type from GET /mono/institutions before subscribing',
      );
    }

    const institutions = await this.getSupportedInstitutions();
    const selected = institutions.find(
      (bank) =>
        bank.institutionId === institutionId &&
        bank.accountType === accountType,
    );
    if (!selected) {
      throw new BadRequestException(
        'The selected bank and account type are not supported',
      );
    }
    return selected;
  }
}

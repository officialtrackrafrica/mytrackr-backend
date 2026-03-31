import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { AppException } from '../../common/errors';

@Injectable()
export class BankAccountService {
  private readonly logger = new Logger(BankAccountService.name);

  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepository: Repository<BankAccount>,
  ) {}

  async listAccounts(
    userId: string,
    businessId: string,
  ): Promise<BankAccount[]> {
    return this.bankAccountRepository.find({
      where: { userId, businessId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
  }

  async setPrimaryAccount(
    userId: string,
    businessId: string,
    accountId: string,
  ): Promise<BankAccount> {
    const account = await this.bankAccountRepository.findOne({
      where: { id: accountId, userId, businessId },
    });

    if (!account) {
      throw AppException.notFound(
        'Bank account not found',
        'BANK_ACCOUNT_NOT_FOUND',
      );
    }

    // Set all other accounts for this business to not primary
    await this.bankAccountRepository.update(
      { userId, businessId, id: Not(accountId) },
      { isPrimary: false },
    );

    // Set this account as primary
    await this.bankAccountRepository.update(accountId, { isPrimary: true });

    const updated = await this.bankAccountRepository.findOneBy({
      id: accountId,
    });
    if (!updated) {
      throw AppException.notFound(
        'Bank account not found after update',
        'BANK_ACCOUNT_UPDATE_FAILED',
      );
    }
    return updated;
  }

  async deleteAccount(
    userId: string,
    businessId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.bankAccountRepository.findOne({
      where: { id: accountId, userId, businessId },
    });

    if (!account) {
      throw AppException.notFound(
        'Bank account not found',
        'BANK_ACCOUNT_NOT_FOUND',
      );
    }

    const wasPrimary = account.isPrimary;

    await this.bankAccountRepository.delete(accountId);

    // If we deleted the primary account, automatically promote another one
    if (wasPrimary) {
      const nextAccount = await this.bankAccountRepository.findOne({
        where: { userId, businessId },
        order: { createdAt: 'ASC' }, // Pick the oldest one as the new primary
      });

      if (nextAccount) {
        await this.bankAccountRepository.update(nextAccount.id, {
          isPrimary: true,
        });
        this.logger.log(
          `Automatically promoted account ${nextAccount.id} to primary for business ${businessId}`,
        );
      }
    }
  }

  async countAccounts(userId: string, businessId: string): Promise<number> {
    return this.bankAccountRepository.count({
      where: { userId, businessId },
    });
  }
}

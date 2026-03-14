import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../entities/transaction.entity';
import {
  CategorizationRule,
  MatchType,
} from '../entities/categorization-rule.entity';

export interface RawTransactionDto {
  bankAccountId: string;
  businessId: string;
  externalId: string;
  date: Date;
  amount: number;
  direction: TransactionDirection;
  description: string;
  valueDate?: Date;
}

@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(CategorizationRule)
    private readonly ruleRepository: Repository<CategorizationRule>,
  ) {}

  async ingestTransactions(
    businessId: string,
    dtos: RawTransactionDto[],
  ): Promise<number> {
    let newTransactionsCount = 0;
    const activeRules = await this.ruleRepository.find({
      where: { businessId, isActive: true },
      order: { priority: 'ASC' },
    });

    const dedupExternalIds = dtos
      .map((dto) => dto.externalId)
      .filter((id) => id != null);

    let existingExternalIds = new Set<string>();
    if (dedupExternalIds.length > 0) {
      const existing = await this.transactionRepository.find({
        where: { businessId, externalId: In(dedupExternalIds) },
        select: ['externalId'],
      });
      existingExternalIds = new Set(existing.map((e) => e.externalId));
    }

    const transactionsToInsert: Transaction[] = [];

    for (const dto of dtos) {
      if (dto.externalId && existingExternalIds.has(dto.externalId)) {
        continue;
      }

      const tx = this.transactionRepository.create({
        ...dto,
        isCategorised: false,
      });

      this.applyRules(tx, activeRules);

      transactionsToInsert.push(tx);
      newTransactionsCount++;
    }

    if (transactionsToInsert.length > 0) {
      await this.transactionRepository.save(transactionsToInsert, {
        chunk: 100,
      });
    }

    return newTransactionsCount;
  }

  private applyRules(tx: Transaction, rules: CategorizationRule[]) {
    const desc = (tx.description || '').toLowerCase();
    for (const rule of rules) {
      const matchVal = rule.matchValue.toLowerCase();
      let isMatch = false;

      switch (rule.matchType) {
        case MatchType.CONTAINS:
          isMatch = desc.includes(matchVal);
          break;
        case MatchType.STARTS_WITH:
          isMatch = desc.startsWith(matchVal);
          break;
        case MatchType.EXACT:
          isMatch = desc === matchVal;
          break;
        case MatchType.REGEX:
          try {
            const regex = new RegExp(rule.matchValue, 'i');
            isMatch = regex.test(tx.description);
          } catch {
            isMatch = false;
          }
          break;
      }

      if (isMatch) {
        tx.category = rule.category as TransactionCategory;
        tx.subCategory = rule.subCategory;
        tx.ruleId = rule.id;
        tx.isCategorised = true;
        break;
      }
    }
  }

  async applyRuleRetroactively(rule: CategorizationRule): Promise<number> {
    let query = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId: rule.businessId })
      .andWhere('tx.isCategorised = :isCat', { isCat: false });

    const descLower = rule.matchValue.toLowerCase();
    if (rule.matchType === MatchType.CONTAINS) {
      query = query.andWhere('LOWER(tx.description) LIKE :match', {
        match: `%${descLower}%`,
      });
    } else if (rule.matchType === MatchType.STARTS_WITH) {
      query = query.andWhere('LOWER(tx.description) LIKE :match', {
        match: `${descLower}%`,
      });
    } else if (rule.matchType === MatchType.EXACT) {
      query = query.andWhere('LOWER(tx.description) = :match', {
        match: descLower,
      });
    } else if (rule.matchType === MatchType.REGEX) {
      query = query.andWhere('tx.description ~* :match', {
        match: rule.matchValue,
      });
    }

    const txsToUpdate = await query.getMany();
    if (txsToUpdate.length === 0) return 0;

    const ids = txsToUpdate.map((t) => t.id);
    await this.transactionRepository.update(ids, {
      category: rule.category as TransactionCategory,
      subCategory: rule.subCategory,
      ruleId: rule.id,
      isCategorised: true,
    });

    return ids.length;
  }
}

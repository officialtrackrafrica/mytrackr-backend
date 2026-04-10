import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CategorizationRule,
  MatchType,
} from '../../finance/entities/categorization-rule.entity';
import { AccountCategoryType } from '../../finance/entities/account-category.entity';

@Injectable()
export class CategorizationRulesSeed {
  private readonly logger = new Logger(CategorizationRulesSeed.name);

  constructor(
    @InjectRepository(CategorizationRule)
    private readonly ruleRepo: Repository<CategorizationRule>,
  ) {}

  async run() {
    this.logger.log('Seeding default categorization rules...');

    const rules: Array<{
      matchType: MatchType;
      matchValue: string;
      category: string;
      subCategory: string;
      priority: number;
    }> = [
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'bank charge',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Bank Charges',
        priority: 10,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'charge',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Bank Charges',
        priority: 15,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'salary',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Wages & Salaries',
        priority: 20,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'wages',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Wages & Salaries',
        priority: 25,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'rent',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Rent',
        priority: 30,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'airtime',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Airtime/Internet Subscription',
        priority: 40,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'data subscription',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Airtime/Internet Subscription',
        priority: 45,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'internet',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Airtime/Internet Subscription',
        priority: 50,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'ikeja electric',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Utility Bill (Light, Water, Waste etc.)',
        priority: 60,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'electricity',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Utility Bill (Light, Water, Waste etc.)',
        priority: 65,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'water bill',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Utility Bill (Light, Water, Waste etc.)',
        priority: 70,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'uber',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Transportation & Logistics',
        priority: 80,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'bolt',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Transportation & Logistics',
        priority: 85,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'fuel',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Transportation & Logistics',
        priority: 90,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'transfer from',
        category: AccountCategoryType.TRANSFER,
        subCategory: 'Transfer from other business account',
        priority: 100,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'transfer to',
        category: AccountCategoryType.TRANSFER,
        subCategory: 'Transfer to other business account',
        priority: 105,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'pos settlement',
        category: AccountCategoryType.INCOME,
        subCategory: 'Money from sales',
        priority: 110,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'sales',
        category: AccountCategoryType.INCOME,
        subCategory: 'Money from sales',
        priority: 115,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'purchase',
        category: AccountCategoryType.COGS,
        subCategory: 'Goods Purchased',
        priority: 120,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'inventory',
        category: AccountCategoryType.COGS,
        subCategory: 'Goods Purchased',
        priority: 125,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'packaging',
        category: AccountCategoryType.COGS,
        subCategory: 'Packaging Cost',
        priority: 130,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'delivery',
        category: AccountCategoryType.COGS,
        subCategory: 'Distribution Cost',
        priority: 135,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'meta',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Marketing/Advertising',
        priority: 140,
      },
      {
        matchType: MatchType.CONTAINS,
        matchValue: 'google ads',
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Marketing/Advertising',
        priority: 145,
      },
    ];

    for (const ruleData of rules) {
      const existing = await this.ruleRepo.findOne({
        where: {
          isSystem: true,
          matchType: ruleData.matchType,
          matchValue: ruleData.matchValue,
          category: ruleData.category,
          subCategory: ruleData.subCategory,
        },
      });

      if (existing) continue;

      await this.ruleRepo.save(
        this.ruleRepo.create({
          ...ruleData,
          isSystem: true,
          isActive: true,
          businessId: null,
        }),
      );
    }
  }
}

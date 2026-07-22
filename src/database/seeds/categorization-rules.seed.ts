import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CategorizationRule,
  MatchType,
} from '../../finance/entities/categorization-rule.entity';
import { AccountCategoryType } from '../../finance/entities/account-category.entity';

export const DEFAULT_CATEGORIZATION_RULES: Array<{
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
    matchValue: 'commission',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Bank Charges',
    priority: 16,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'sms alert',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Bank Charges',
    priority: 17,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'card maint',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Bank Charges',
    priority: 18,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'stamp duty',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Taxes & Levies',
    priority: 19,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'vat',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Taxes & Levies',
    priority: 20,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'credit interest',
    category: AccountCategoryType.INCOME,
    subCategory: 'Other money inflow',
    priority: 21,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'neft trans',
    category: AccountCategoryType.INCOME,
    subCategory: 'Other money inflow',
    priority: 22,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'salary',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Salaries & Wages',
    priority: 30,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'wages',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Salaries & Wages',
    priority: 35,
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
    subCategory: 'Airtime/Data Subscription',
    priority: 40,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'data subscription',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Airtime/Data Subscription',
    priority: 45,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'internet',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Airtime/Data Subscription',
    priority: 50,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'ikeja electric',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Utlity Bill (Light, Water, Waste etc.)',
    priority: 60,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'electricity',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Utlity Bill (Light, Water, Waste etc.)',
    priority: 65,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'water bill',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Utlity Bill (Light, Water, Waste etc.)',
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
    matchValue: 'brand deal',
    category: AccountCategoryType.INCOME,
    subCategory: 'Money from brand deal',
    priority: 116,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'creative gig',
    category: AccountCategoryType.INCOME,
    subCategory: 'Money from creative gigs',
    priority: 117,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'creative gigs',
    category: AccountCategoryType.INCOME,
    subCategory: 'Money from creative gigs',
    priority: 118,
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
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'subscription',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Subscription - Capcut, Captions etc.',
    priority: 150,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'professional service',
    category: AccountCategoryType.EXPENSE,
    subCategory: 'Professional Services',
    priority: 155,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'personal withdrawal',
    category: AccountCategoryType.EQUITY,
    subCategory: 'Personal Use',
    priority: 160,
  },
  {
    matchType: MatchType.CONTAINS,
    matchValue: 'personal use',
    category: AccountCategoryType.EQUITY,
    subCategory: 'Personal Use',
    priority: 165,
  },
];

@Injectable()
export class CategorizationRulesSeed {
  private readonly logger = new Logger(CategorizationRulesSeed.name);

  constructor(
    @InjectRepository(CategorizationRule)
    private readonly ruleRepo: Repository<CategorizationRule>,
  ) {}

  async run() {
    this.logger.log('Seeding default categorization rules...');

    await this.ruleRepo.delete({
      isSystem: true,
      matchValue: In(['transfer from', 'transfer to']),
    });

    for (const ruleData of DEFAULT_CATEGORIZATION_RULES) {
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

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AccountCategory,
  AccountCategoryType,
} from '../../finance/entities/account-category.entity';
import { AccountSubCategory } from '../../finance/entities/account-subcategory.entity';

@Injectable()
export class FinancialCategoriesSeed {
  private readonly logger = new Logger(FinancialCategoriesSeed.name);

  constructor(
    @InjectRepository(AccountCategory)
    private readonly categoryRepo: Repository<AccountCategory>,
    @InjectRepository(AccountSubCategory)
    private readonly subCategoryRepo: Repository<AccountSubCategory>,
  ) {}

  async run() {
    this.logger.log('Seeding financial categories and sub-categories...');

    await this.subCategoryRepo.delete({
      isSystem: true,
      name: In([
        'Salary and Wages',
        'Wages & Salaries',
        'Subscriptions',
        'Software Subscription',
        'Utility Bill (Light, Water, Waste etc.)',
        'Airtime/Internet Subscription',
        'Personal use',
        'Owner Withdrawal (for personal use)',
      ]),
    });

    await this.categoryRepo.delete({
      isSystem: true,
      type: In([
        AccountCategoryType.ASSET,
        AccountCategoryType.LIABILITY,
        AccountCategoryType.EQUITY,
        AccountCategoryType.TRANSFER,
      ]),
    });

    const categories = [
      {
        name: 'Income',
        type: AccountCategoryType.INCOME,
        subs: [
          'Money from sales',
          'Money from brand deal',
          'Money from creative gigs',
          'Gifted money',
          'Other money inflow',
        ],
      },
      {
        name: 'Selling/Production Cost',
        type: AccountCategoryType.COGS,
        subs: ['Goods Purchased', 'Packaging Cost', 'Distribution Cost'],
      },
      {
        name: 'Expenses',
        type: AccountCategoryType.EXPENSE,
        subs: [
          'Rent',
          'Salaries & Wages',
          'Marketing/Advertising',
          'Subscription - Capcut, Captions etc.',
          'Utlity Bill (Light, Water, Waste etc.)',
          'Airtime/Data Subscription',
          'Transportation & Logistics',
          'Bank Charges',
          'Travel Expenses',
          'Supplies & Stationery',
          'Repairs & Maintenance',
          'Taxes & Levies',
          'Professional Services',
          'Insurance',
          'Miscellaneous',
        ],
      },
      {
        name: "Owner's Money",
        type: AccountCategoryType.EQUITY,
        subs: ['Capital contributed'],
      },
      {
        name: 'Personal Withdrawal',
        type: AccountCategoryType.EQUITY,
        subs: ['Personal Use'],
      },
      {
        name: 'Internal Transfers',
        type: AccountCategoryType.TRANSFER,
        subs: [
          'Transfer from other business account',
          'Transfer to other business account',
        ],
      },
    ];

    for (const catData of categories) {
      let category = await this.categoryRepo.findOne({
        where: { name: catData.name, type: catData.type },
      });

      if (!category) {
        category = this.categoryRepo.create({
          name: catData.name,
          type: catData.type,
          isSystem: true,
        });
        await this.categoryRepo.save(category);
        this.logger.log(`Created Category: ${catData.name}`);
      }

      for (const subName of catData.subs) {
        const subExists = await this.subCategoryRepo.findOne({
          where: { name: subName, categoryId: category.id },
        });

        if (!subExists) {
          const sub = this.subCategoryRepo.create({
            name: subName,
            categoryId: category.id,
            isSystem: true,
          });
          await this.subCategoryRepo.save(sub);
          this.logger.log(`  Added Sub-category: ${subName}`);
        }
      }
    }
  }
}

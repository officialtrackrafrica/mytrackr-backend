import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    const categories = [
      {
        name: 'Income (Profit Statement)',
        type: AccountCategoryType.INCOME,
        subs: ['Money from sales', 'Gifted money', 'Other money inflow'],
      },
      {
        name: 'Selling/Production Cost (Profit Statement)',
        type: AccountCategoryType.COGS,
        subs: ['Goods Purchased', 'Packaging Cost', 'Distribution Cost'],
      },
      {
        name: 'Expenses (Profit Statement)',
        type: AccountCategoryType.EXPENSE,
        subs: [
          'Rent',
          'Wages & Salaries',
          'Marketing/Advertising',
          'Software Subscription',
          'Utility Bill (Light, Water, Waste etc.)',
          'Airtime/Internet Subscription',
          'Transportation & Logistics',
          'Bank Charges',
          'Travel Expenses',
          'Supplies & Stationery',
          'Repairs & Maintenance',
          'Taxes & Levies',
          'Insurance',
          'Miscellaneous',
        ],
      },
      {
        name: 'Assets (Balance Sheet)',
        type: AccountCategoryType.ASSET,
        subs: [
          'Cash in Bank Account',
          'Cash in Hand',
          'Goods/Stock/Inventory',
          'Money Owed by Customers (Receivables)',
          'Land & Buildings',
          'Equipment & Machinery',
          'Furniture',
          'Other Assets',
        ],
      },
      {
        name: 'Liabilities (Balance Sheet)',
        type: AccountCategoryType.LIABILITY,
        subs: [
          'Business Loan',
          'Cooperative Loan',
          'Friends & Family Loan',
          'Money owed to Supplier',
          'Other Liabilities',
        ],
      },
      {
        name: 'Owner’s Money (Balance Sheet)',
        type: AccountCategoryType.EQUITY,
        subs: ['Capital contributed', 'Owner Withdrawal (for personal use)'],
      },
      {
        name: 'Internal Transfers',
        type: AccountCategoryType.TRANSFER,
        subs: [
          'Transfer to other business account',
          'Transfer from other business account',
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

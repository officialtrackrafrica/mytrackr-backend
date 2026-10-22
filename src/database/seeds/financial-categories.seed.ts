import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AccountCategory,
  AccountCategoryType,
} from '../../finance/entities/account-category.entity';
import {
  AccountSubCategory,
  SubCategoryAccountingType,
} from '../../finance/entities/account-subcategory.entity';

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
          'Food and Snacks',
          'Bank Charges',
          'Travel Expenses',
          'Supplies & Stationery',
          'Repairs & Maintenance',
          'Taxes & Levies',
          'Professional Services',
          'Insurance',
          'Licenses and permits',
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
        name: 'Business Assets and Savings',
        type: AccountCategoryType.ASSET,
        subs: [
          'Business savings or investment',
          'Equipment or fixed asset purchase',
          'Loan advanced or receivable',
        ],
      },
      {
        name: 'Loans and Borrowing',
        type: AccountCategoryType.LIABILITY,
        subs: ['Loan received', 'Loan principal repayment'],
      },
      {
        name: 'Internal Transfers',
        type: AccountCategoryType.TRANSFER,
        subs: [
          'Transfer from other business account',
          'Transfer to other business account',
          'Refund and Reversal',
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
        const accountingType = this.getAccountingType(
          catData.type,
          subName,
        );
        const subExists = await this.subCategoryRepo.findOne({
          where: { name: subName, categoryId: category.id },
          select: {
            id: true,
            name: true,
            categoryId: true,
            accountingType: true,
          },
        });

        if (!subExists) {
          const sub = this.subCategoryRepo.create({
            name: subName,
            categoryId: category.id,
            isSystem: true,
            accountingType,
          });
          await this.subCategoryRepo.save(sub);
          this.logger.log(`  Added Sub-category: ${subName}`);
        } else if (subExists.accountingType !== accountingType) {
          subExists.accountingType = accountingType;
          await this.subCategoryRepo.save(subExists);
        }
      }
    }
  }

  private getAccountingType(
    categoryType: AccountCategoryType,
    subCategory: string,
  ): SubCategoryAccountingType {
    const normalized = subCategory.toLowerCase();

    if (normalized.includes('refund') || normalized.includes('reversal')) {
      return SubCategoryAccountingType.REFUND_REVERSAL;
    }

    switch (categoryType) {
      case AccountCategoryType.INCOME:
        return SubCategoryAccountingType.REVENUE;
      case AccountCategoryType.COGS:
        return SubCategoryAccountingType.COGS;
      case AccountCategoryType.EXPENSE:
        return /tax|interest/.test(normalized)
          ? SubCategoryAccountingType.OTHER_EXPENSE
          : SubCategoryAccountingType.OPERATING_EXPENSE;
      case AccountCategoryType.ASSET:
        return SubCategoryAccountingType.ASSET_MOVEMENT;
      case AccountCategoryType.LIABILITY:
        return normalized.includes('repayment')
          ? SubCategoryAccountingType.LOAN_REPAYMENT
          : SubCategoryAccountingType.LOAN_RECEIVED;
      case AccountCategoryType.EQUITY:
        return normalized.includes('personal') ||
          normalized.includes('withdrawal')
          ? SubCategoryAccountingType.OWNER_DRAWING
          : SubCategoryAccountingType.OWNER_CONTRIBUTION;
      case AccountCategoryType.TRANSFER:
        return SubCategoryAccountingType.INTERNAL_TRANSFER;
      default:
        return SubCategoryAccountingType.UNCLASSIFIED;
    }
  }
}

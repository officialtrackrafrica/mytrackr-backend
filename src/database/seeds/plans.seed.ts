import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../../payments/entities/plan.entity';

@Injectable()
export class PlansSeed {
  private readonly logger = new Logger(PlansSeed.name);

  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async run() {
    const plans = [
      {
        name: 'Starter',
        slug: 'starter',
        price: 500,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'upload_bank_statement',
          'Upload your bank statement manually',
          'all_financial_reports',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'tax_estimator',
          'Tax estimator',
          'automatic_categorization',
          'Automatic categorization rules',
        ],
        capabilities: {
          upload_bank_statement: true,
          all_financial_reports: true,
          tax_estimator: true,
          automatic_categorization: true,
          bankAccountLimit: 0,
        },
        isActive: true,
      },
      {
        name: 'Web',
        slug: 'web',
        price: 1200,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'website_linking',
          'Link via website',
          'all_financial_reports',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'tax_estimator',
          'Tax estimator',
          'automatic_categorization',
          'Automatic categorization rules',
          'upload_bank_statement',
          'Upload your bank statement manually',
        ],
        capabilities: {
          website_linking: true,
          upload_bank_statement: true,
          all_financial_reports: true,
          tax_estimator: true,
          automatic_categorization: true,
          bankAccountLimit: 0,
        },
        isActive: true,
      },
      {
        name: 'Solo',
        slug: 'solo',
        price: 2900,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'sync_1_bank_account',
          'Live sync - 1 bank account',
          'all_financial_reports',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'tax_estimator',
          'Tax estimator',
          'automatic_categorization',
          'Automatic categorization rules',
          'website_linking',
          'upload_bank_statement',
          'Website linking and manual bank statement upload included',
        ],
        capabilities: {
          sync_1_bank_account: true,
          website_linking: true,
          upload_bank_statement: true,
          all_financial_reports: true,
          tax_estimator: true,
          automatic_categorization: true,
          bankAccountLimit: 1,
        },
        isActive: true,
      },
      {
        name: 'Duo',
        slug: 'duo',
        price: 3400,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'sync_2_bank_accounts',
          'Live sync - 2 bank accounts',
          'all_financial_reports',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'tax_estimator',
          'Tax estimator',
          'automatic_categorization',
          'Automatic categorization rules',
          'website_linking',
          'upload_bank_statement',
          'Website linking and manual bank statement upload included',
        ],
        capabilities: {
          sync_1_bank_account: true,
          sync_2_bank_accounts: true,
          website_linking: true,
          upload_bank_statement: true,
          all_financial_reports: true,
          tax_estimator: true,
          automatic_categorization: true,
          bankAccountLimit: 2,
        },
        isActive: true,
      },
      {
        name: 'Unlimited',
        slug: 'unlimited',
        price: 5500,
        currency: 'NGN',
        interval: 'monthly',
        features: [
          'sync_unlimited_bank_accounts',
          'Live sync - unlimited bank accounts',
          'all_financial_reports',
          'All financial reports',
          'P&L, Cash Flow & Balance Sheet',
          'tax_estimator',
          'Tax estimator',
          'automatic_categorization',
          'Automatic categorization rules',
          'website_linking',
          'upload_bank_statement',
          'Website linking and manual bank statement upload included',
        ],
        capabilities: {
          sync_1_bank_account: true,
          sync_2_bank_accounts: true,
          sync_unlimited_bank_accounts: true,
          website_linking: true,
          upload_bank_statement: true,
          all_financial_reports: true,
          tax_estimator: true,
          automatic_categorization: true,
          bankAccountLimit: Number.MAX_SAFE_INTEGER,
        },
        isActive: true,
      },
      // Legacy aliases kept for backward compatibility with existing records.
      {
        name: 'Free',
        slug: 'free',
        price: 0,
        currency: 'NGN',
        interval: 'monthly',
        features: ['Legacy free plan'],
        capabilities: { bankAccountLimit: 0 },
        isActive: false,
      },
      {
        name: 'Premium',
        slug: 'premium',
        price: 2900,
        currency: 'NGN',
        interval: 'monthly',
        features: ['Legacy premium plan'],
        capabilities: { bankAccountLimit: 1 },
        isActive: false,
      },
      {
        name: 'Premium Yearly',
        slug: 'premium-yearly',
        price: 29000.0,
        currency: 'NGN',
        interval: 'annually',
        features: ['Legacy premium yearly plan'],
        capabilities: { bankAccountLimit: 1 },
        isActive: false,
      },
    ];

    for (const planData of plans) {
      const existing = await this.planRepository.findOne({
        where: { slug: planData.slug },
      });

      if (existing) {
        this.logger.debug(`Plan ${planData.slug} already exists, updating...`);
        Object.assign(existing, planData);
        await this.planRepository.save(existing);
      } else {
        this.logger.log(`Creating Plan ${planData.slug}...`);
        const plan = this.planRepository.create(planData);
        await this.planRepository.save(plan);
      }
    }
  }
}

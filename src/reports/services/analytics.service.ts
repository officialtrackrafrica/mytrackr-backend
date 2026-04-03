import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
} from '../../finance/entities/transaction.entity';
import { BusinessService } from '../../business/services/business.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly businessService: BusinessService,
  ) {}

  async getAnalytics(
    userId: string,
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' = 'day',
  ) {
    const businessId = await this.businessService.getBusinessIdForUser(userId);

    let dateFormat: string;
    switch (interval) {
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'week':
        dateFormat = 'IYYY-IW'; // ISO Year and ISO Week
        break;
      case 'day':
      default:
        dateFormat = 'YYYY-MM-DD';
        break;
    }

    const results = await this.transactionRepository
      .createQueryBuilder('tx')
      .select(`TO_CHAR(tx.date, '${dateFormat}')`, 'period')
      .addSelect('tx.category', 'category')
      .addSelect('tx.direction', 'direction')
      .addSelect('SUM(tx.amount)', 'total')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('tx.isCategorised = :isCat', { isCat: true })
      .andWhere('tx.category != :transfer', {
        transfer: TransactionCategory.TRANSFER,
      })
      .groupBy(`TO_CHAR(tx.date, '${dateFormat}')`)
      .addGroupBy('tx.category')
      .addGroupBy('tx.direction')
      .orderBy('period', 'ASC')
      .getRawMany();

    // Map results to a time-series object
    const timeSeries: Record<
      string,
      { revenue: number; expenses: number; netProfit: number }
    > = {};

    for (const r of results) {
      if (r.category === TransactionCategory.TRANSFER) continue;
      const period = r.period;
      const amount = parseFloat(r.total);

      if (!timeSeries[period]) {
        timeSeries[period] = { revenue: 0, expenses: 0, netProfit: 0 };
      }

      if (
        r.category === TransactionCategory.INCOME &&
        r.direction === TransactionDirection.CREDIT
      ) {
        timeSeries[period].revenue += amount;
      } else if (
        (r.category === TransactionCategory.EXPENSE ||
          r.category === TransactionCategory.COGS) &&
        r.direction === TransactionDirection.DEBIT
      ) {
        timeSeries[period].expenses += amount;
      }
    }

    // Final processing to calculate netProfit and ensure all periods are included (optional, but good for charts)
    const data = Object.keys(timeSeries).map((period) => {
      const entry = timeSeries[period];
      entry.netProfit = entry.revenue - entry.expenses;
      return {
        period,
        ...entry,
      };
    });

    return data;
  }
}

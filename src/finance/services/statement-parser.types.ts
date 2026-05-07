import { TransactionDirection } from '../entities/transaction.entity';

export interface ParsedRow {
  date: string;
  name?: string;
  amount: number;
  direction: TransactionDirection;
  description: string;
  reference?: string;
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TransactionDirection } from '../entities/transaction.entity';
import { ParsedRow } from './statement-parser.types';

interface GroqResponsesApiResult {
  output_text?: string;
}

@Injectable()
export class StatementAiParserService {
  private readonly logger = new Logger(StatementAiParserService.name);
  private readonly groqApiKey?: string;
  private readonly groqBaseUrl: string;
  private readonly groqModel: string;

  constructor(private readonly configService: ConfigService) {
    this.groqApiKey = this.configService.get<string>('GROQ_API_KEY');
    this.groqBaseUrl =
      this.configService.get<string>('GROQ_BASE_URL') ||
      'https://api.groq.com/openai/v1';
    this.groqModel =
      this.configService.get<string>('GROQ_MODEL') || 'openai/gpt-oss-20b';
  }

  isEnabled(): boolean {
    return !!this.groqApiKey;
  }

  async extractTransactionsFromText(text: string): Promise<ParsedRow[]> {
    if (!this.groqApiKey) {
      this.logger.warn(
        'Groq fallback parser skipped because GROQ_API_KEY is not configured.',
      );
      return [];
    }

    const prompt = [
      'Extract bank transactions from the statement text below.',
      'Return JSON only with this exact shape:',
      '{"transactions":[{"date":"YYYY-MM-DD","description":"string","amount":123.45,"direction":"CREDIT|DEBIT","name":"optional string","reference":"optional string"}]}',
      'Rules:',
      '- Return only actual transaction rows.',
      '- Exclude headers, summaries, opening balance, closing balance, page numbers, and totals.',
      '- amount must always be a positive number.',
      '- direction must be CREDIT or DEBIT.',
      '- date must be normalized to YYYY-MM-DD.',
      '- If a field is unknown, omit it.',
      '- Do not include markdown fences.',
      '',
      'Statement text:',
      text,
    ].join('\n');

    this.logger.log(`Calling Groq fallback parser with model ${this.groqModel}`);

    const response = await axios.post<GroqResponsesApiResult>(
      `${this.groqBaseUrl}/responses`,
      {
        model: this.groqModel,
        input: prompt,
      },
      {
        headers: {
          Authorization: `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      },
    );

    const outputText = response.data?.output_text?.trim() || '';
    if (!outputText) {
      this.logger.warn('Groq fallback parser returned an empty response.');
      return [];
    }

    this.logger.log(
      `Groq raw output preview (first 4000 chars): ${outputText.slice(0, 4000)}`,
    );

    const parsed = this.parseGroqOutput(outputText);
    this.logger.log(
      `Groq fallback parser returned ${parsed.length} normalized transaction rows`,
    );
    return parsed;
  }

  private parseGroqOutput(outputText: string): ParsedRow[] {
    const jsonString = this.extractJsonObject(outputText);
    if (!jsonString) {
      this.logger.warn('Groq output did not contain a valid JSON object.');
      return [];
    }

    try {
      const parsed = JSON.parse(jsonString) as {
        transactions?: Array<Record<string, unknown>>;
      };
      const transactions = Array.isArray(parsed.transactions)
        ? parsed.transactions
        : [];

      return transactions
        .map((item) => this.normalizeRow(item))
        .filter((row): row is ParsedRow => !!row);
    } catch (error: any) {
      this.logger.error(`Failed to parse Groq JSON output: ${error.message}`);
      return [];
    }
  }

  private extractJsonObject(outputText: string): string | null {
    const fenced = outputText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const start = outputText.indexOf('{');
    const end = outputText.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    return outputText.slice(start, end + 1).trim();
  }

  private normalizeRow(item: Record<string, unknown>): ParsedRow | null {
    const date = this.normalizeDate(item.date);
    const description =
      typeof item.description === 'string' ? item.description.trim() : '';
    const amount = this.normalizeAmount(item.amount);
    const direction = this.normalizeDirection(item.direction);
    const name = typeof item.name === 'string' ? item.name.trim() : undefined;
    const reference =
      typeof item.reference === 'string' ? item.reference.trim() : undefined;

    if (!date || !description || amount <= 0 || !direction) {
      return null;
    }

    return {
      date,
      description,
      amount,
      direction,
      name: name || undefined,
      reference: reference || undefined,
    };
  }

  private normalizeDate(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const candidate = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      return candidate;
    }

    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().split('T')[0];
  }

  private normalizeAmount(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.abs(value) : 0;
    }

    if (typeof value !== 'string') {
      return 0;
    }

    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  }

  private normalizeDirection(
    value: unknown,
  ): TransactionDirection | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();
    if (normalized === TransactionDirection.CREDIT) {
      return TransactionDirection.CREDIT;
    }
    if (normalized === TransactionDirection.DEBIT) {
      return TransactionDirection.DEBIT;
    }

    return null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TransactionDirection } from '../entities/transaction.entity';
import { ParsedRow } from './statement-parser.types';

interface ChatCompletionsApiResult {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
}

@Injectable()
export class StatementAiParserService {
  private readonly logger = new Logger(StatementAiParserService.name);
  private readonly statementAiApiKey?: string;
  private readonly statementAiBaseUrl: string;
  private readonly statementAiModel: string;

  constructor(private readonly configService: ConfigService) {
    this.statementAiApiKey =
      this.configService.get<string>('STATEMENT_AI_API_KEY') ||
      this.configService.get<string>('GROQ_API_KEY') ||
      'ollama';
    this.statementAiBaseUrl =
      this.configService.get<string>('STATEMENT_AI_BASE_URL') ||
      this.configService.get<string>('GROQ_BASE_URL') ||
      'http://ollama:11434/v1';
    this.statementAiModel =
      this.configService.get<string>('STATEMENT_AI_MODEL') ||
      this.configService.get<string>('GROQ_MODEL') ||
      'phi3:mini';
  }

  isEnabled(): boolean {
    return !!this.statementAiBaseUrl && !!this.statementAiModel;
  }

  async extractTransactionsFromText(text: string): Promise<ParsedRow[]> {
    if (!this.isEnabled()) {
      this.logger.warn(
        'AI fallback parser skipped because STATEMENT_AI_BASE_URL or STATEMENT_AI_MODEL is not configured.',
      );
      return [];
    }

    this.logger.log(
      `Calling AI fallback parser with model ${this.statementAiModel}`,
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.statementAiApiKey) {
      headers.Authorization = `Bearer ${this.statementAiApiKey}`;
    }

    const response = await axios.post<ChatCompletionsApiResult>(
      `${this.statementAiBaseUrl}/chat/completions`,
      {
        model: this.statementAiModel,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'Extract bank transactions from statement text.',
              'Return JSON only with this exact shape:',
              '{"transactions":[{"date":"YYYY-MM-DD","description":"string","amount":123.45,"direction":"CREDIT|DEBIT","name":"optional string","reference":"optional string"}]}',
              'Return only actual transaction rows.',
              'Exclude headers, summaries, balances, page numbers, and totals.',
              'amount must always be positive.',
              'direction must be CREDIT or DEBIT.',
              'date must be normalized to YYYY-MM-DD.',
              'If a field is unknown, omit it.',
              'Do not include markdown fences.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: text,
          },
        ],
      },
      {
        headers,
        timeout: 120000,
      },
    );

    const rawContent = response.data?.choices?.[0]?.message?.content;
    const outputText =
      typeof rawContent === 'string'
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => (typeof part?.text === 'string' ? part.text : ''))
              .join('')
              .trim()
          : '';

    if (!outputText) {
      this.logger.warn('AI fallback parser returned an empty response.');
      return [];
    }

    this.logger.log(
      `AI raw output preview (first 4000 chars): ${outputText.slice(0, 4000)}`,
    );

    const parsed = this.parseAiOutput(outputText);
    this.logger.log(
      `AI fallback parser returned ${parsed.length} normalized transaction rows`,
    );
    return parsed;
  }

  private parseAiOutput(outputText: string): ParsedRow[] {
    const jsonString = this.extractJsonObject(outputText);
    if (!jsonString) {
      this.logger.warn('AI output did not contain a valid JSON object.');
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
      this.logger.error(`Failed to parse AI JSON output: ${error.message}`);
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

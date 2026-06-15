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

interface OllamaChatApiResult {
  message?: {
    content?: string;
  };
}

interface GoogleGenerateContentResult {
  candidates?: Array<{
    content?: {
      parts?: Array<{
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
  private readonly statementAiTemperature: number;
  private readonly statementAiTopP: number;
  private readonly statementAiTimeoutMs: number;

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
    this.statementAiTemperature = this.getNumberConfig(
      'STATEMENT_AI_TEMPERATURE',
      0,
    );
    this.statementAiTopP = this.getNumberConfig('STATEMENT_AI_TOP_P', 0.1);
    this.statementAiTimeoutMs = this.getPositiveIntConfig(
      'STATEMENT_AI_TIMEOUT_MS',
      120000,
    );
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

    const systemPrompt = [
      'Extract bank transactions from statement text.',
      'Return JSON only with this exact shape:',
      '{"transactions":[{"date":"YYYY-MM-DD","description":"string","amount":123.45,"direction":"CREDIT|DEBIT","name":"optional string","reference":"optional string"}]}',
      'Return only actual transaction rows.',
      'Exclude headers, summaries, balances, page numbers, and totals.',
      'amount must always be positive.',
      'direction must be CREDIT or DEBIT.',
      'date must be normalized to YYYY-MM-DD.',
      'Do not infer, repair, or invent missing transactions.',
      'If the text is ambiguous or incomplete, omit that row.',
      'If no clearly supported transactions exist, return {"transactions":[]}.',
      'Every returned row must be directly grounded in the provided text.',
      'If a field is unknown, omit it.',
      'Do not include markdown fences.',
    ].join('\n');

    let outputText = '';

    try {
      outputText = await this.callAiParser(headers, systemPrompt, text);
    } catch (error: unknown) {
      this.logger.warn(
        `AI fallback parser request failed: ${this.describeRequestError(error)}`,
      );
      return [];
    }

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

  private async callAiParser(
    headers: Record<string, string>,
    systemPrompt: string,
    text: string,
  ): Promise<string> {
    if (this.isGoogleAiStudioBaseUrl()) {
      return this.callGoogleAiStudio(systemPrompt, text);
    }

    try {
      const response = await axios.post<ChatCompletionsApiResult>(
        this.resolveOpenAiCompatibleEndpoint(),
        {
          model: this.statementAiModel,
          temperature: this.statementAiTemperature,
          top_p: this.statementAiTopP,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: text,
            },
          ],
        },
        {
          headers,
          timeout: this.statementAiTimeoutMs,
        },
      );

      return this.extractOpenAiContent(response.data);
    } catch (error: any) {
      if (!this.shouldRetryWithOllamaNative(error)) {
        throw error;
      }

      this.logger.warn(
        `OpenAI-compatible AI endpoint returned 404. Retrying with Ollama native chat API at ${this.resolveOllamaNativeEndpoint()}.`,
      );

      const response = await axios.post<OllamaChatApiResult>(
        this.resolveOllamaNativeEndpoint(),
        {
          model: this.statementAiModel,
          stream: false,
          format: 'json',
          options: {
            temperature: this.statementAiTemperature,
            top_p: this.statementAiTopP,
          },
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: text,
            },
          ],
        },
        {
          headers,
          timeout: this.statementAiTimeoutMs,
        },
      );

      return typeof response.data?.message?.content === 'string'
        ? response.data.message.content.trim()
        : '';
    }
  }

  private async callGoogleAiStudio(
    systemPrompt: string,
    text: string,
  ): Promise<string> {
    const response = await axios.post<GoogleGenerateContentResult>(
      `${this.resolveGoogleGenerateContentEndpoint()}?key=${encodeURIComponent(this.statementAiApiKey || '')}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  systemPrompt,
                  '',
                  'Statement text:',
                  text,
                ].join('\n'),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: this.statementAiTemperature,
          topP: this.statementAiTopP,
          responseMimeType: 'application/json',
          responseSchema: this.getGoogleTransactionSchema(),
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: this.statementAiTimeoutMs,
      },
    );

    return (
      response.data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || ''
    );
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

  private extractOpenAiContent(response: ChatCompletionsApiResult): string {
    const rawContent = response?.choices?.[0]?.message?.content;
    return typeof rawContent === 'string'
      ? rawContent.trim()
      : Array.isArray(rawContent)
        ? rawContent
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
            .trim()
        : '';
  }

  private shouldRetryWithOllamaNative(error: unknown): boolean {
    return (
      axios.isAxiosError(error) &&
      error.response?.status === 404 &&
      !this.isExplicitEndpoint(this.statementAiBaseUrl)
    );
  }

  private describeRequestError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data =
        error.response?.data === undefined
          ? ''
          : ` - ${JSON.stringify(error.response.data)}`;

      if (status) {
        return `status ${status}${data}`;
      }

      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private resolveOpenAiCompatibleEndpoint(): string {
    const baseUrl = this.statementAiBaseUrl.replace(/\/+$/, '');
    if (this.isExplicitEndpoint(baseUrl)) {
      return baseUrl;
    }

    return baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;
  }

  private resolveGoogleGenerateContentEndpoint(): string {
    const baseUrl = this.statementAiBaseUrl.replace(/\/+$/, '');
    if (/\/models\/[^/]+:generateContent$/i.test(baseUrl)) {
      return baseUrl;
    }

    return `${baseUrl}/models/${this.statementAiModel}:generateContent`;
  }

  private resolveOllamaNativeEndpoint(): string {
    const baseUrl = this.statementAiBaseUrl.replace(/\/+$/, '');
    const withoutV1 = baseUrl.replace(/\/v1$/i, '');
    return `${withoutV1}/api/chat`;
  }

  private isExplicitEndpoint(url: string): boolean {
    return /\/(?:chat\/completions|api\/chat)$/i.test(url);
  }

  private isGoogleAiStudioBaseUrl(): boolean {
    return /generativelanguage\.googleapis\.com/i.test(
      this.statementAiBaseUrl,
    );
  }

  private getGoogleTransactionSchema() {
    return {
      type: 'OBJECT',
      properties: {
        transactions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING' },
              description: { type: 'STRING' },
              amount: { type: 'NUMBER' },
              direction: {
                type: 'STRING',
                enum: ['CREDIT', 'DEBIT'],
              },
              name: { type: 'STRING' },
              reference: { type: 'STRING' },
            },
            required: ['date', 'description', 'amount', 'direction'],
          },
        },
      },
      required: ['transactions'],
    };
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

  private getNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private getPositiveIntConfig(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

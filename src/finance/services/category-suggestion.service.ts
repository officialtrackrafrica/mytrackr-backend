import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Transaction } from '../entities/transaction.entity';
import { CategorizationService } from './categorization.service';

type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  categoryType: string;
  subCategoryId?: string;
  subCategoryName?: string;
  confidence: number;
  reason: string;
};

type AiSuggestion = {
  categoryName?: string;
  categoryType?: string;
  subCategoryName?: string;
  confidence?: number;
  reason?: string;
};

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
export class CategorySuggestionService {
  private readonly logger = new Logger(CategorySuggestionService.name);
  private readonly aiApiKey?: string;
  private readonly aiBaseUrl: string;
  private readonly aiModel: string;
  private readonly aiTemperature: number;
  private readonly aiTopP: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly categorizationService: CategorizationService,
  ) {
    this.aiApiKey =
      this.configService.get<string>('CATEGORY_SUGGESTION_AI_API_KEY') ||
      this.configService.get<string>('STATEMENT_AI_API_KEY') ||
      this.configService.get<string>('GROQ_API_KEY') ||
      'ollama';
    this.aiBaseUrl =
      this.configService.get<string>('CATEGORY_SUGGESTION_AI_BASE_URL') ||
      this.configService.get<string>('STATEMENT_AI_BASE_URL') ||
      this.configService.get<string>('GROQ_BASE_URL') ||
      'http://ollama:11434/v1';
    this.aiModel =
      this.configService.get<string>('CATEGORY_SUGGESTION_AI_MODEL') ||
      this.configService.get<string>('STATEMENT_AI_MODEL') ||
      this.configService.get<string>('GROQ_MODEL') ||
      'phi3:mini';
    this.aiTemperature = this.getNumberConfig(
      'CATEGORY_SUGGESTION_AI_TEMPERATURE',
      0.1,
    );
    this.aiTopP = this.getNumberConfig('CATEGORY_SUGGESTION_AI_TOP_P', 0.2);
  }

  async suggestForTransaction(
    transaction: Transaction,
    businessId: string,
    userId: string,
  ): Promise<CategorySuggestion[]> {
    const categories =
      await this.categorizationService.listCategories(businessId);

    if (categories.length === 0 || !this.aiBaseUrl || !this.aiModel) {
      return this.fallbackSuggestions(transaction, categories);
    }

    const allowedCatalog = categories.map((category) => ({
      categoryName: category.name,
      categoryType: category.type,
      subCategories: category.subCategories.map((subCategory) => ({
        name: subCategory.name,
      })),
    }));

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.aiApiKey) {
        headers.Authorization = `Bearer ${this.aiApiKey}`;
      }

      const response = await axios.post<ChatCompletionsApiResult>(
        `${this.aiBaseUrl}/chat/completions`,
        {
          model: this.aiModel,
          temperature: this.aiTemperature,
          top_p: this.aiTopP,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'You are a transaction categorization assistant for MyTrackr.',
                'You must suggest only from the provided category and subcategory list.',
                'Never invent a category or subcategory outside the provided catalog.',
                'Return JSON only with this exact shape:',
                '{"suggestions":[{"categoryName":"string","categoryType":"string","subCategoryName":"string or omitted","confidence":0.0,"reason":"string"}]}',
                'Return at most 3 suggestions.',
                'Confidence must be between 0 and 1.',
                'Prefer a valid subcategory when possible.',
                'If unsure, still pick the closest valid option from the catalog.',
                'Do not include markdown fences.',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify({
                transaction: {
                  description: transaction.description,
                  name: transaction.name || undefined,
                  amount: Number(transaction.amount),
                  direction: transaction.direction,
                  monoCategory: transaction.monoCategory || undefined,
                  existingAiCategory: transaction.aiCategory || undefined,
                  notes: transaction.notes || undefined,
                },
                allowedCatalog,
                userId,
              }),
            },
          ],
        },
        {
          headers,
          timeout: 30000,
        },
      );

      const suggestions = this.parseAiSuggestions(response.data);
      const validated = this.validateSuggestions(suggestions, categories);
      return validated.length > 0
        ? validated
        : this.fallbackSuggestions(transaction, categories);
    } catch (error: any) {
      this.logger.warn(
        `Category suggestion AI request failed: ${error.message}`,
      );
      return this.fallbackSuggestions(transaction, categories);
    }
  }

  private parseAiSuggestions(
    response: ChatCompletionsApiResult,
  ): AiSuggestion[] {
    const rawContent = response.choices?.[0]?.message?.content;
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
      return [];
    }

    const jsonString = this.extractJsonObject(outputText);
    if (!jsonString) {
      return [];
    }

    try {
      const parsed = JSON.parse(jsonString) as {
        suggestions?: AiSuggestion[];
      };
      return Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    } catch (error: any) {
      this.logger.warn(
        `Failed to parse category suggestion AI output: ${error.message}`,
      );
      return [];
    }
  }

  private validateSuggestions(
    suggestions: AiSuggestion[],
    categories: Awaited<
      ReturnType<CategorizationService['listCategories']>
    >,
  ): CategorySuggestion[] {
    const validated: CategorySuggestion[] = [];
    const seen = new Set<string>();

    for (const suggestion of suggestions) {
      const category = categories.find(
        (item) =>
          item.name.toLowerCase() ===
            String(suggestion.categoryName || '').toLowerCase() ||
          item.type.toLowerCase() ===
            String(suggestion.categoryType || '').toLowerCase(),
      );

      if (!category) {
        continue;
      }

      const matchedSubCategory = suggestion.subCategoryName
        ? category.subCategories.find(
            (sub) =>
              sub.name.toLowerCase() ===
              suggestion.subCategoryName!.toLowerCase(),
          )
        : undefined;

      const dedupeKey = `${category.id}:${matchedSubCategory?.id || ''}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      validated.push({
        categoryId: category.id,
        categoryName: category.name,
        categoryType: category.type,
        subCategoryId: matchedSubCategory?.id,
        subCategoryName: matchedSubCategory?.name,
        confidence: this.normalizeConfidence(suggestion.confidence),
        reason:
          typeof suggestion.reason === 'string' && suggestion.reason.trim()
            ? suggestion.reason.trim()
            : 'Matched against the closest allowed category.',
      });

      if (validated.length === 3) {
        break;
      }
    }

    return validated;
  }

  private fallbackSuggestions(
    transaction: Transaction,
    categories: Awaited<ReturnType<CategorizationService['listCategories']>>,
  ): CategorySuggestion[] {
    const candidates = [
      transaction.aiCategory,
      transaction.monoCategory,
      transaction.subCategory,
      transaction.category,
    ].filter(Boolean) as string[];

    const suggestions: CategorySuggestion[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const matchedSubCategory = categories
        .flatMap((category) =>
          category.subCategories.map((subCategory) => ({
            category,
            subCategory,
          })),
        )
        .find(
          ({ subCategory }) =>
            subCategory.name.toLowerCase() === candidate.toLowerCase(),
        );

      if (matchedSubCategory) {
        const key = `${matchedSubCategory.category.id}:${matchedSubCategory.subCategory.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push({
            categoryId: matchedSubCategory.category.id,
            categoryName: matchedSubCategory.category.name,
            categoryType: matchedSubCategory.category.type,
            subCategoryId: matchedSubCategory.subCategory.id,
            subCategoryName: matchedSubCategory.subCategory.name,
            confidence: 0.55,
            reason: 'Derived from an existing transaction category signal.',
          });
        }
        continue;
      }

      const matchedCategory = categories.find(
        (category) =>
          category.type.toLowerCase() === candidate.toLowerCase() ||
          category.name.toLowerCase() === candidate.toLowerCase(),
      );

      if (!matchedCategory) {
        continue;
      }

      const key = `${matchedCategory.id}:`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      suggestions.push({
        categoryId: matchedCategory.id,
        categoryName: matchedCategory.name,
        categoryType: matchedCategory.type,
        confidence: 0.5,
        reason: 'Derived from an existing transaction category signal.',
      });
    }

    return suggestions.slice(0, 3);
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

  private normalizeConfidence(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, value));
  }

  private getNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}

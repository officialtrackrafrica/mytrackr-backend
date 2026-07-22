import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import axios from 'axios';
import {
  Transaction,
  TransactionCategory,
  TransactionDirection,
  CategorySource,
} from '../entities/transaction.entity';
import {
  CategorizationRule,
  MatchType,
} from '../entities/categorization-rule.entity';
import { AiCategorizationService } from '../../categorization/categorization.service';
import { AccountCategory } from '../entities/account-category.entity';
import { AccountSubCategory } from '../entities/account-subcategory.entity';

export interface RawTransactionDto {
  bankAccountId?: string;
  businessId?: string;
  userId?: string;
  externalId: string;
  date: Date;
  name?: string;
  amount: number;
  direction: TransactionDirection;
  description: string;
  monoCategory?: string;
  valueDate?: Date;
}

export interface IngestTransactionOptions {
  autoCategorize?: boolean;
}

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

interface GoogleGenerateContentResult {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

type GeminiCategorizationResult = {
  categoryName?: string;
  categoryType?: string;
  subCategoryName?: string;
  confidence?: number;
};

export type RetroactiveAiProvider = 'gemini' | 'legacy';

/**
 * Confidence threshold above which the AI prediction is auto-applied and the
 * transaction is marked as fully categorised without human review.
 */
const AI_AUTO_APPLY_THRESHOLD = 0.8;

@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(CategorizationRule)
    private readonly ruleRepository: Repository<CategorizationRule>,
    @InjectRepository(AccountCategory)
    private readonly categoryRepo: Repository<AccountCategory>,
    @InjectRepository(AccountSubCategory)
    private readonly subCategoryRepo: Repository<AccountSubCategory>,
    // ✅ Injected — gRPC AI engine
    private readonly aiCategorizationService: AiCategorizationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Main ingestion pipeline.
   *
   * Order of priority for each transaction:
   *  1. System-defined categorization rules
   *  2. AI prediction with confidence > 80%  (auto-applied)
   *  3. Direction-based heuristic fallback  (credit=INCOME, debit=EXPENSE)
   *
   * The heuristic ensures isCategorised is ALWAYS true after ingestion,
   * which means /reports/analytics will never return an empty array again.
   */
  async ingestTransactions(
    businessId: string | null,
    userId: string | null,
    dtos: RawTransactionDto[],
    options: IngestTransactionOptions = {},
  ): Promise<number> {
    const autoCategorize = options.autoCategorize ?? false;
    let newTransactionsCount = 0;
    const activeRules = await this.ruleRepository.find({
      where: { isSystem: true, isActive: true },
      order: { priority: 'ASC' },
    });

    // Dedup: skip transactions already stored
    const dedupExternalIds = dtos
      .map((dto) => dto.externalId)
      .filter((id) => id != null);

    let existingMap = new Map<
      string,
      { id: string; businessId: string | null }
    >();
    if (dedupExternalIds.length > 0) {
      const existing = await this.transactionRepository.find({
        where: { externalId: In(dedupExternalIds) },
        select: ['id', 'externalId', 'businessId'],
      });
      existingMap = new Map(
        existing.map((e) => [
          e.externalId,
          { id: e.id, businessId: e.businessId },
        ]),
      );
    }

    const transactionsToInsert: Transaction[] = [];
    const transactionsToUpdate: Transaction[] = [];

    for (const dto of dtos) {
      let tx: Transaction;
      const existing = dto.externalId ? existingMap.get(dto.externalId) : null;

      if (existing) {
        if (existing.businessId === (businessId || null)) {
          // Already exists with the same business context.
          // Check if it still needs categorisation (e.g. from a previous
          // sync that failed AI / had no rules).
          const full = await this.transactionRepository.findOneBy({
            id: existing.id,
          });
          if (full && !full.isCategorised) {
            tx = full;
            if (!autoCategorize) {
              transactionsToUpdate.push(tx);
              continue;
            }
            // ── Step 0: Preserve Manual if present ───────────────────────────
            if (
              tx.categorySource === CategorySource.MANUAL &&
              tx.manualCategory
            ) {
              tx.category = tx.manualCategory;
              tx.subCategory = tx.manualSubCategory;
              tx.isCategorised = true;
            }

            // ── Step 1: Rule-based matching ──────────────────────────────────
            if (!tx.isCategorised) {
              await this.applyRules(tx, activeRules);
            }

            // ── Step 2: AI prediction ───────────────────────────────────────
            if (!tx.isCategorised) {
              await this.applyAiPrediction(
                tx,
                this.getCategorizationText(dto),
                userId ?? '',
              );
            }

            if (!tx.isCategorised) {
              await this.applyGeminiPrediction(
                tx,
                businessId || undefined,
                userId ?? '',
              );
            }

            // ── Step 3: Mono default category ───────────────────────────────
            if (!tx.isCategorised && dto.monoCategory) {
              tx.category = dto.monoCategory;
              tx.categorySource = CategorySource.MONO;
              tx.isCategorised = true;
            }

            // ── Step 4: Direction-based heuristic fallback ───────────────────
            if (!tx.isCategorised) {
              tx.category =
                dto.direction === TransactionDirection.CREDIT
                  ? TransactionCategory.INCOME
                  : TransactionCategory.EXPENSE;

              const cat = await this.categoryRepo.findOne({
                where: { type: tx.category as any },
              });
              if (cat) tx.categoryId = cat.id;

              tx.heuristicCategory = tx.category;
              tx.isCategorised = true;
              tx.categorySource = CategorySource.HEURISTIC;
              this.logger.debug(
                `Heuristic fallback applied to existing tx "${dto.description}": ${tx.category}`,
              );
            }
            transactionsToUpdate.push(tx);
          }
          continue;
        }

        // Exists but with a different (or null) businessId → re-claim it
        const fullTx = await this.transactionRepository.findOneBy({
          id: existing.id,
        });
        if (!fullTx) continue;

        fullTx.businessId = businessId as any;
        fullTx.userId = userId as any;
        fullTx.isCategorised = false;
        tx = fullTx;
        transactionsToUpdate.push(tx);
      } else {
        // Brand-new transaction
        tx = this.transactionRepository.create({
          ...dto,
          businessId: businessId || undefined,
          userId: userId || undefined,
          monoCategory: dto.monoCategory || undefined,
          isCategorised: false,
        });
        transactionsToInsert.push(tx);
        newTransactionsCount++;
      }

      // ── Step 1: Rule-based matching ────────────────────────────────────────
      if (!autoCategorize) {
        continue;
      }

      await this.applyRules(tx, activeRules);

      // ── Step 2: AI prediction (only if rules didn't match) ─────────────────
      if (!tx.isCategorised) {
        await this.applyAiPrediction(
          tx,
          this.getCategorizationText(dto),
          userId ?? '',
        );
      }

      if (!tx.isCategorised) {
        await this.applyGeminiPrediction(
          tx,
          businessId || undefined,
          userId ?? '',
        );
      }

      // ── Step 3: Mono default category ─────────────────────────────────────
      if (!tx.isCategorised && dto.monoCategory) {
        tx.category = dto.monoCategory;
        tx.categorySource = CategorySource.MONO;
        tx.isCategorised = true;
        this.logger.debug(
          `Mono's default category applied to "${dto.description}": ${tx.category}`,
        );
      }

      // ── Step 4: Direction-based heuristic fallback ─────────────────────────
      // Guarantees isCategorised = true so reports are never empty.
      if (!tx.isCategorised) {
        tx.category =
          dto.direction === TransactionDirection.CREDIT
            ? TransactionCategory.INCOME
            : TransactionCategory.EXPENSE;

        // Resolve to dynamic ID if possible for first-class reporting
        const cat = await this.categoryRepo.findOne({
          where: { type: tx.category as any },
        });
        if (cat) tx.categoryId = cat.id;

        tx.heuristicCategory = tx.category;
        tx.isCategorised = true;
        tx.categorySource = CategorySource.HEURISTIC;
        this.logger.debug(
          `Heuristic fallback applied to "${dto.description}": ${tx.category}`,
        );
      }
    }

    if (transactionsToInsert.length > 0) {
      await this.transactionRepository.save(transactionsToInsert, {
        chunk: 100,
      });
    }

    if (transactionsToUpdate.length > 0) {
      await this.transactionRepository.save(transactionsToUpdate, {
        chunk: 100,
      });
      this.logger.log(
        `Updated ${transactionsToUpdate.length} existing transactions with business context (business=${businessId})`,
      );
    }

    this.logger.log(
      `Ingested ${newTransactionsCount} new transactions (business=${businessId}, user=${userId})`,
    );

    return newTransactionsCount;
  }

  /**
   * Retroactive AI Sync — fixes all currently uncategorised transactions for a
   * given business/user.  Call this once via the endpoint below to instantly
   * populate dashboards for existing accounts.
   *
   * Returns the number of transactions updated.
   */
  async retroactiveAiSync(
    businessId: string | null,
    userId: string | null,
    provider: RetroactiveAiProvider = 'gemini',
  ): Promise<number> {
    const query = this.transactionRepository
      .createQueryBuilder('tx')
      .where(
        new Brackets((qb) => {
          qb.where('tx.isCategorised = :isCategorised', {
            isCategorised: false,
          })
            .orWhere(
              'tx.categorySource = :aiSource AND tx.direction = :creditDirection AND tx.category IN (:...debitCategories)',
              {
                aiSource: CategorySource.AI,
                creditDirection: TransactionDirection.CREDIT,
                debitCategories: [
                  TransactionCategory.EXPENSE,
                  TransactionCategory.COGS,
                  TransactionCategory.ASSET,
                ],
              },
            )
            .orWhere(
              'tx.categorySource = :aiSource AND tx.direction = :debitDirection AND tx.category IN (:...creditCategories)',
              {
                aiSource: CategorySource.AI,
                debitDirection: TransactionDirection.DEBIT,
                creditCategories: [
                  TransactionCategory.INCOME,
                  TransactionCategory.LIABILITY,
                  TransactionCategory.EQUITY,
                ],
              },
            )
            .orWhere(
              'tx.categorySource = :aiSource AND tx.subCategory = :badUtilitySubCategory',
              {
                aiSource: CategorySource.AI,
                badUtilitySubCategory: 'Utlity Bill (Light, Water, Waste etc.)',
              },
            );
        }),
      );

    if (businessId) {
      query.andWhere('tx.businessId = :businessId', { businessId });
    } else if (userId) {
      query.andWhere('tx.userId = :userId', { userId });
    }

    const uncategorised = await query.getMany();

    if (uncategorised.length === 0) {
      this.logger.log('Retroactive AI sync: nothing to update.');
      return 0;
    }

    this.logger.log(
      `Retroactive AI sync: processing ${uncategorised.length} uncategorised transactions...`,
    );

    const activeRules = await this.ruleRepository.find({
      where: { isSystem: true, isActive: true },
      order: { priority: 'ASC' },
    });

    let updatedCount = 0;
    for (const tx of uncategorised) {
      const description = this.getCategorizationText(tx);
      const wasInvalidAiCategory =
        tx.categorySource === CategorySource.AI &&
        tx.category &&
        (!this.isCategoryDirectionCompatible(tx, tx.category) ||
          tx.subCategory === 'Utlity Bill (Light, Water, Waste etc.)');

      if (wasInvalidAiCategory) {
        tx.category = null as any;
        tx.subCategory = null as any;
        tx.categoryId = null as any;
        tx.subCategoryId = null as any;
        tx.aiCategory = null as any;
        tx.isCategorised = false;
      }

      const ruleMatched = await this.applyRules(tx, activeRules);
      if (!tx.isCategorised) {
        if (provider === 'legacy') {
          await this.applyAiPrediction(tx, description, userId ?? '');
        } else {
          await this.applyGeminiPrediction(
            tx,
            businessId || undefined,
            userId ?? '',
          );
        }
      } else if (ruleMatched) {
        await this.learnFromCategorizedTransaction(tx, userId ?? '');
      }

      if (!tx.isCategorised) {
        if (provider === 'legacy') {
          const geminiMatched = await this.applyGeminiPrediction(
            tx,
            businessId || undefined,
            userId ?? '',
          );
          if (geminiMatched) {
            await this.learnFromCategorizedTransaction(tx, userId ?? '');
          }
        }
      }

      // Fall back to direction heuristic
      if (!tx.isCategorised) {
        tx.category =
          tx.direction === TransactionDirection.CREDIT
            ? TransactionCategory.INCOME
            : TransactionCategory.EXPENSE;

        const cat = await this.categoryRepo.findOne({
          where: { type: tx.category as any },
        });
        if (cat) tx.categoryId = cat.id;

        tx.heuristicCategory = tx.category;
        tx.isCategorised = true;
        tx.categorySource = CategorySource.HEURISTIC;
      }

      updatedCount++;
    }

    await this.transactionRepository.save(uncategorised, { chunk: 100 });

    this.logger.log(
      `Retroactive AI sync complete: updated ${updatedCount} transactions.`,
    );

    return updatedCount;
  }

  /**
   * Repair Orphaned Transactions — Fixes ALL transactions for a user that
   * are missing a businessId or are uncategorised.
   *
   * This is the nuclear fix for the zero-value reports issue. It:
   *  1. Finds every transaction belonging to the user (by userId or externalId)
   *  2. Assigns the correct businessId
   *  3. Re-runs the categorisation pipeline on uncategorised ones
   */
  async repairOrphanedTransactions(
    businessId: string,
    userId: string,
  ): Promise<{ repaired: number; categorised: number }> {
    // Find ALL transactions for this user, regardless of businessId
    const orphaned = await this.transactionRepository.find({
      where: [
        { userId, businessId: null as any },
        { userId, isCategorised: false },
      ],
    });

    if (orphaned.length === 0) {
      this.logger.log(
        `Repair: No orphaned transactions found for user ${userId}`,
      );
      return { repaired: 0, categorised: 0 };
    }

    this.logger.log(
      `Repair: Found ${orphaned.length} orphaned/uncategorised transactions for user ${userId}`,
    );

    let repaired = 0;
    let categorised = 0;

    for (const tx of orphaned) {
      // Fix businessId
      if (!tx.businessId || tx.businessId !== businessId) {
        tx.businessId = businessId;
        repaired++;
      }

      // Fix categorisation
      if (!tx.isCategorised) {
        const description = this.getCategorizationText(tx);
        await this.applyAiPrediction(tx, description, userId);

        if (!tx.isCategorised) {
          tx.category =
            tx.direction === TransactionDirection.CREDIT
              ? TransactionCategory.INCOME
              : TransactionCategory.EXPENSE;

          const cat = await this.categoryRepo.findOne({
            where: { type: tx.category as any },
          });
          if (cat) tx.categoryId = cat.id;
          tx.heuristicCategory = tx.category;
          tx.isCategorised = true;
          tx.categorySource = CategorySource.HEURISTIC;
        }
        categorised++;
      }
    }

    await this.transactionRepository.save(orphaned, { chunk: 100 });

    this.logger.log(
      `Repair complete: ${repaired} re-linked, ${categorised} categorised`,
    );

    return { repaired, categorised };
  }

  /**
   * Returns a hierarchical list of account categories and their sub-categories.
   * Includes all system-default categories.
   */
  async listCategories(businessId?: string): Promise<AccountCategory[]> {
    const query = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.subCategories', 'subCategory')
      .where(
        new Brackets((qb) => {
          qb.where('category.isSystem = :isSystem', { isSystem: true });
          if (businessId) {
            qb.orWhere('category.businessId = :businessId', { businessId });
          }
        }),
      );

    const categories = await query
      .orderBy('category.type', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('subCategory.name', 'ASC')
      .getMany();

    return categories.map((category) => ({
      ...category,
      name: this.getCategoryDisplayName(category.name),
    }));
  }

  private getCategoryDisplayName(name: string): string {
    return name.replace(/\s*\(Balance Sheet\)$/i, '');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Calls the gRPC AI engine and auto-applies the result if confidence is
   * above the threshold.  Also stores the AI suggestion on low-confidence hits
   * so the frontend can show a hint even when not auto-applying.
   */
  private async applyAiPrediction(
    tx: Transaction,
    description: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const predicted = await this.aiCategorizationService.predict(
        description,
        userId,
      );

      if (
        predicted.category &&
        predicted.category !== 'Uncategorized' &&
        predicted.confidence >= AI_AUTO_APPLY_THRESHOLD
      ) {
        const sub = await this.resolveAiSubCategory(predicted.category);

        if (sub) {
          if (!this.isCategoryDirectionCompatible(tx, sub.category.type)) {
            tx.aiCategory = predicted.category;
            tx.notes = `AI suggestion rejected: ${predicted.category} is not compatible with ${tx.direction}`;
            this.logger.warn(
              `Rejected AI prediction "${predicted.category}" for ${tx.direction} transaction: "${description}"`,
            );
            return false;
          }

          if (!this.hasSubCategoryEvidence(sub.name, description)) {
            tx.aiCategory = predicted.category;
            tx.notes = `AI suggestion rejected: ${predicted.category} is not supported by transaction text`;
            this.logger.warn(
              `Rejected AI prediction "${predicted.category}" without text evidence for: "${description}"`,
            );
            return false;
          }

          tx.subCategory = sub.name;
          tx.subCategoryId = sub.id;
          tx.category = sub.category.type as TransactionCategory;
          tx.categoryId = sub.category.id;
          tx.isCategorised = true;
        } else {
          tx.aiCategory = predicted.category;
          tx.notes = `AI suggestion rejected: ${predicted.category} does not match an active subcategory`;
          this.logger.warn(
            `Rejected unknown AI category "${predicted.category}" for: "${description}"`,
          );
          return false;
        }

        tx.aiCategory = predicted.category;
        tx.categorySource = CategorySource.AI;

        this.logger.debug(
          `AI auto-applied "${predicted.category}" (${(predicted.confidence * 100).toFixed(1)}%) to: "${description}"`,
        );
        return true;
      } else if (predicted.category && predicted.category !== 'Uncategorized') {
        // Low confidence — store as a suggestion but don't mark as categorised
        // so the user is nudged to review it.
        // We use the `notes` field to carry the suggestion without polluting
        // the real category column.
        // low confidence -> still preserve the ai prediction explicitly!
        tx.aiCategory = predicted.category;
        tx.notes = `AI suggestion: ${predicted.category} (${(predicted.confidence * 100).toFixed(1)}% confidence)`;
        this.logger.debug(
          `AI suggestion stored (low confidence ${(predicted.confidence * 100).toFixed(1)}%) for: "${description}"`,
        );
      }
    } catch (err) {
      // AI errors must never block ingestion
      this.logger.warn(
        `AI prediction failed for "${description}": ${err.message}`,
      );
    }

    return false;
  }

  private async resolveAiSubCategory(
    predictedCategory: string,
  ): Promise<AccountSubCategory | null> {
    const normalizedPrediction = this.normalizeCategoryName(predictedCategory);

    const subCategories = await this.subCategoryRepo.find({
      relations: ['category'],
    });

    return (
      subCategories.find(
        (subCategory) =>
          this.normalizeCategoryName(subCategory.name) ===
          normalizedPrediction,
      ) || null
    );
  }

  private hasSubCategoryEvidence(
    subCategoryName: string,
    description: string,
  ): boolean {
    const normalizedSubCategory = this.normalizeCategoryName(subCategoryName);
    const normalizedDescription = this.normalizeCategoryName(description);

    if (normalizedSubCategory.includes('utlity bill')) {
      return /\b(electric|electricity|water|waste|utility|utilities|nepa|phcn|disco|ikeja electric|eko electric|aedc|ibedc|kedco|phed|jed|yedc)\b/i.test(
        normalizedDescription,
      );
    }

    return true;
  }

  private isCategoryDirectionCompatible(
    tx: Transaction,
    categoryType: string,
  ): boolean {
    if (tx.direction === TransactionDirection.CREDIT) {
      const compatibleCreditCategories: string[] = [
        TransactionCategory.INCOME,
        TransactionCategory.LIABILITY,
        TransactionCategory.EQUITY,
        TransactionCategory.TRANSFER,
      ];
      return compatibleCreditCategories.includes(categoryType);
    }

    if (tx.direction === TransactionDirection.DEBIT) {
      const compatibleDebitCategories: string[] = [
        TransactionCategory.EXPENSE,
        TransactionCategory.COGS,
        TransactionCategory.ASSET,
        TransactionCategory.TRANSFER,
      ];
      return compatibleDebitCategories.includes(categoryType);
    }

    return true;
  }

  private normalizeCategoryName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async applyRules(
    tx: Transaction,
    rules: CategorizationRule[],
  ): Promise<boolean> {
    const desc = (tx.description || '').toLowerCase();
    const name = (tx.name || '').toLowerCase();

    for (const rule of rules) {
      const matchVal = rule.matchValue.toLowerCase();
      let isMatch = false;

      switch (rule.matchType) {
        case MatchType.CONTAINS:
          isMatch = desc.includes(matchVal) || name.includes(matchVal);
          break;
        case MatchType.STARTS_WITH:
          isMatch = desc.startsWith(matchVal) || name.startsWith(matchVal);
          break;
        case MatchType.EXACT:
          isMatch = desc === matchVal || name === matchVal;
          break;
        case MatchType.REGEX:
          try {
            const regex = new RegExp(rule.matchValue, 'i');
            isMatch = regex.test(desc) || regex.test(name);
          } catch {
            isMatch = false;
          }
          break;
      }

      if (isMatch) {
        tx.category = rule.category as TransactionCategory;
        tx.subCategory = rule.subCategory;
        tx.ruleCategory = rule.category;
        tx.ruleSubCategory = rule.subCategory;
        tx.ruleId = rule.id;
        tx.categorySource = CategorySource.RULE;
        tx.isCategorised = true;
        await this.resolveRuleCategoryIds(tx, rule);
        return true;
      }
    }

    return false;
  }

  private async resolveRuleCategoryIds(
    tx: Transaction,
    rule: CategorizationRule,
  ): Promise<void> {
    if (rule.subCategory) {
      const subCategory = await this.subCategoryRepo.findOne({
        where: { name: rule.subCategory },
        relations: ['category'],
      });

      if (subCategory?.category) {
        tx.subCategoryId = subCategory.id;
        tx.categoryId = subCategory.category.id;
        tx.category = subCategory.category.type as TransactionCategory;
        return;
      }
    }

    const category = await this.categoryRepo.findOne({
      where: { type: rule.category as any },
    });
    if (category) {
      tx.categoryId = category.id;
    }
  }

  async learnFromCategorizedTransaction(
    tx: Transaction,
    userId: string,
  ): Promise<void> {
    const description = this.getCategorizationText(tx);
    const label = tx.subCategory || tx.category;

    if (!description || !label) {
      return;
    }

    try {
      await this.aiCategorizationService.learnFeedback(
        description,
        label,
        userId,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to teach categorization engine: ${error.message}`,
      );
    }
  }

  private async applyGeminiPrediction(
    tx: Transaction,
    businessId: string | undefined,
    userId: string,
  ): Promise<boolean> {
    const aiBaseUrl =
      this.configService.get<string>('CATEGORY_SUGGESTION_AI_BASE_URL') ||
      this.configService.get<string>('STATEMENT_AI_BASE_URL') ||
      this.configService.get<string>('GROQ_BASE_URL') ||
      '';
    const aiModel =
      this.configService.get<string>('CATEGORY_SUGGESTION_AI_MODEL') ||
      this.configService.get<string>('STATEMENT_AI_MODEL') ||
      this.configService.get<string>('GROQ_MODEL') ||
      '';

    if (!aiBaseUrl || !aiModel) {
      return false;
    }

    const categories = await this.listCategories(businessId);
    if (categories.length === 0) {
      return false;
    }

    const aiApiKey =
      this.configService.get<string>('CATEGORY_SUGGESTION_AI_API_KEY') ||
      this.configService.get<string>('STATEMENT_AI_API_KEY') ||
      this.configService.get<string>('GROQ_API_KEY');
    const aiTemperature = this.getNumberConfig(
      'CATEGORY_SUGGESTION_AI_TEMPERATURE',
      0.1,
    );
    const aiTopP = this.getNumberConfig('CATEGORY_SUGGESTION_AI_TOP_P', 0.2);
    const aiTimeoutMs = this.getPositiveIntConfig(
      'CATEGORY_SUGGESTION_AI_TIMEOUT_MS',
      30000,
    );
    const allowedCatalog = categories.map((category) => ({
      categoryName: category.name,
      categoryType: category.type,
      subCategories: category.subCategories.map((subCategory) => ({
        name: subCategory.name,
      })),
    }));
    const systemPrompt = [
      'You are a transaction categorization assistant for MyTrackr.',
      'Choose exactly one category and, when possible, one subcategory from the provided catalog.',
      'Never invent a category or subcategory outside the catalog.',
      'The transaction direction is authoritative: CREDIT transactions cannot be categorized as EXPENSE, COGS, or ASSET; DEBIT transactions cannot be categorized as INCOME, LIABILITY, or EQUITY unless the catalog category is TRANSFER.',
      'Return JSON only with this exact shape:',
      '{"categoryName":"string","categoryType":"string","subCategoryName":"string or omitted","confidence":0.0}',
      'Confidence must be between 0 and 1.',
      'Do not include markdown fences.',
    ].join('\n');
    const userPrompt = JSON.stringify({
      transaction: {
        description: tx.description,
        name: tx.name || undefined,
        amount: Number(tx.amount),
        direction: tx.direction,
        monoCategory: tx.monoCategory || undefined,
        existingAiCategory: tx.aiCategory || undefined,
      },
      allowedCatalog,
      userId,
    });

    try {
      const response = this.isGoogleAiStudioBaseUrl(aiBaseUrl)
        ? await this.callGoogleCategorizationAi(
            aiBaseUrl,
            aiModel,
            aiApiKey,
            aiTemperature,
            aiTopP,
            aiTimeoutMs,
            systemPrompt,
            userPrompt,
          )
        : await this.callOpenAiCompatibleCategorizationAi(
            aiBaseUrl,
            aiModel,
            aiApiKey,
            aiTemperature,
            aiTopP,
            aiTimeoutMs,
            systemPrompt,
            userPrompt,
          );
      const result = this.parseGeminiCategorization(response);
      const confidence = this.normalizeConfidence(result?.confidence);

      if (!result || confidence < AI_AUTO_APPLY_THRESHOLD) {
        if (result?.categoryName || result?.categoryType) {
          tx.notes = `Gemini suggestion: ${result.subCategoryName || result.categoryName || result.categoryType} (${(confidence * 100).toFixed(1)}% confidence)`;
        }
        return false;
      }

      return this.applyValidatedAiCategory(tx, result, categories);
    } catch (error: any) {
      this.logger.warn(`Gemini categorization failed: ${error.message}`);
      return false;
    }
  }

  private async callOpenAiCompatibleCategorizationAi(
    aiBaseUrl: string,
    aiModel: string,
    aiApiKey: string | undefined,
    aiTemperature: number,
    aiTopP: number,
    aiTimeoutMs: number,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<ChatCompletionsApiResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (aiApiKey) {
      headers.Authorization = `Bearer ${aiApiKey}`;
    }

    const response = await axios.post<ChatCompletionsApiResult>(
      this.resolveOpenAiCompatibleEndpoint(aiBaseUrl),
      {
        model: aiModel,
        temperature: aiTemperature,
        top_p: aiTopP,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      { headers, timeout: aiTimeoutMs },
    );

    return response.data;
  }

  private async callGoogleCategorizationAi(
    aiBaseUrl: string,
    aiModel: string,
    aiApiKey: string | undefined,
    aiTemperature: number,
    aiTopP: number,
    aiTimeoutMs: number,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<ChatCompletionsApiResult> {
    const response = await axios.post<GoogleGenerateContentResult>(
      `${this.resolveGoogleGenerateContentEndpoint(aiBaseUrl, aiModel)}?key=${encodeURIComponent(aiApiKey || '')}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: [systemPrompt, '', userPrompt].join('\n') }],
          },
        ],
        generationConfig: {
          temperature: aiTemperature,
          topP: aiTopP,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              categoryName: { type: 'STRING' },
              categoryType: { type: 'STRING' },
              subCategoryName: { type: 'STRING' },
              confidence: { type: 'NUMBER' },
            },
            required: ['categoryName', 'categoryType', 'confidence'],
          },
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: aiTimeoutMs,
      },
    );

    return {
      choices: [
        {
          message: {
            content:
              response.data?.candidates?.[0]?.content?.parts
                ?.map((part) => part.text || '')
                .join('')
                .trim() || '',
          },
        },
      ],
    };
  }

  private parseGeminiCategorization(
    response: ChatCompletionsApiResult,
  ): GeminiCategorizationResult | null {
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
    const jsonString = this.extractJsonObject(outputText);
    if (!jsonString) {
      return null;
    }

    try {
      return JSON.parse(jsonString) as GeminiCategorizationResult;
    } catch (error: any) {
      this.logger.warn(
        `Failed to parse Gemini categorization: ${error.message}`,
      );
      return null;
    }
  }

  private applyValidatedAiCategory(
    tx: Transaction,
    result: GeminiCategorizationResult,
    categories: AccountCategory[],
  ): boolean {
    const category = categories.find(
      (item) =>
        item.name.toLowerCase() ===
          String(result.categoryName || '').toLowerCase() ||
        item.type.toLowerCase() ===
          String(result.categoryType || '').toLowerCase(),
    );

    if (!category) {
      return false;
    }

    if (!this.isCategoryDirectionCompatible(tx, category.type)) {
      tx.notes = `AI suggestion rejected: ${category.type} is not compatible with ${tx.direction}`;
      return false;
    }

    const subCategory = result.subCategoryName
      ? category.subCategories.find(
          (item) =>
            item.name.toLowerCase() === result.subCategoryName!.toLowerCase(),
        )
      : undefined;

    const categorizationText = this.getCategorizationText(tx);
    if (
      subCategory &&
      !this.hasSubCategoryEvidence(subCategory.name, categorizationText)
    ) {
      tx.notes = `AI suggestion rejected: ${subCategory.name} is not supported by transaction text`;
      return false;
    }

    tx.category = category.type as TransactionCategory;
    tx.categoryId = category.id;
    tx.subCategory = (subCategory?.name || null) as any;
    tx.subCategoryId = (subCategory?.id || null) as any;
    tx.aiCategory = subCategory?.name || category.type;
    tx.categorySource = CategorySource.AI;
    tx.isCategorised = true;

    return true;
  }

  private getCategorizationText(tx: {
    name?: string | null;
    description?: string | null;
  }) {
    return [tx.name, tx.description]
      .map((value) => value?.trim())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' - ');
  }

  private extractJsonObject(outputText: string): string | null {
    if (!outputText) {
      return null;
    }

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

  private resolveOpenAiCompatibleEndpoint(aiBaseUrl: string): string {
    const baseUrl = aiBaseUrl.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(baseUrl)) {
      return baseUrl;
    }

    return baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;
  }

  private resolveGoogleGenerateContentEndpoint(
    aiBaseUrl: string,
    aiModel: string,
  ): string {
    const baseUrl = aiBaseUrl.replace(/\/+$/, '');
    if (/\/models\/[^/]+:generateContent$/i.test(baseUrl)) {
      return baseUrl;
    }

    return `${baseUrl}/models/${aiModel}:generateContent`;
  }

  private isGoogleAiStudioBaseUrl(aiBaseUrl: string): boolean {
    return /generativelanguage\.googleapis\.com/i.test(aiBaseUrl);
  }

  private normalizeConfidence(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
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

  private getPositiveIntConfig(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  async applyRuleRetroactively(rule: CategorizationRule): Promise<number> {
    let query = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.isCategorised = :isCat', { isCat: false });

    if (rule.businessId) {
      query = query.andWhere('tx.businessId = :businessId', {
        businessId: rule.businessId,
      });
    }

    const descLower = rule.matchValue.toLowerCase();
    if (rule.matchType === MatchType.CONTAINS) {
      query = query.andWhere(
        '(LOWER(tx.description) LIKE :match OR LOWER(tx.name) LIKE :match)',
        { match: `%${descLower}%` },
      );
    } else if (rule.matchType === MatchType.STARTS_WITH) {
      query = query.andWhere(
        '(LOWER(tx.description) LIKE :match OR LOWER(tx.name) LIKE :match)',
        { match: `${descLower}%` },
      );
    } else if (rule.matchType === MatchType.EXACT) {
      query = query.andWhere(
        '(LOWER(tx.description) = :match OR LOWER(tx.name) = :match)',
        { match: descLower },
      );
    } else if (rule.matchType === MatchType.REGEX) {
      query = query.andWhere(
        '(tx.description ~* :match OR tx.name ~* :match)',
        { match: rule.matchValue },
      );
    }

    const txsToUpdate = await query.getMany();
    if (txsToUpdate.length === 0) return 0;

    const ids = txsToUpdate.map((t) => t.id);
    const updateData: Partial<Transaction> = {
      category: rule.category as TransactionCategory,
      subCategory: rule.subCategory,
      ruleId: rule.id,
      categorySource: CategorySource.RULE,
      isCategorised: true,
    };
    const sampleTx = new Transaction();
    await this.resolveRuleCategoryIds(sampleTx, rule);
    if (sampleTx.categoryId) {
      updateData.categoryId = sampleTx.categoryId;
    }
    if (sampleTx.subCategoryId) {
      updateData.subCategoryId = sampleTx.subCategoryId;
    }
    if (sampleTx.category) {
      updateData.category = sampleTx.category;
    }

    await this.transactionRepository.update(ids, {
      ...updateData,
    });

    return ids.length;
  }
}

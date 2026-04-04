import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
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
  bankAccountId: string;
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
  ) {}

  /**
   * Main ingestion pipeline.
   *
   * Order of priority for each transaction:
   *  1. User-defined CategorizationRules  (highest trust — explicit)
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
  ): Promise<number> {
    let newTransactionsCount = 0;
    let activeRules: CategorizationRule[] = [];

    if (businessId) {
      activeRules = await this.ruleRepository.find({
        where: { businessId, isActive: true },
        order: { priority: 'ASC' },
      });
    }

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
              this.applyRules(tx, activeRules);
            }

            // ── Step 2: AI prediction ───────────────────────────────────────
            if (!tx.isCategorised) {
              await this.applyAiPrediction(tx, dto.description, userId ?? '');
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
      this.applyRules(tx, activeRules);

      // ── Step 2: AI prediction (only if rules didn't match) ─────────────────
      if (!tx.isCategorised) {
        await this.applyAiPrediction(tx, dto.description, userId ?? '');
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
  ): Promise<number> {
    const where: any = { isCategorised: false };
    if (businessId) where.businessId = businessId;
    else if (userId) where.userId = userId;

    const uncategorised = await this.transactionRepository.find({ where });

    if (uncategorised.length === 0) {
      this.logger.log('Retroactive AI sync: nothing to update.');
      return 0;
    }

    this.logger.log(
      `Retroactive AI sync: processing ${uncategorised.length} uncategorised transactions...`,
    );

    let updatedCount = 0;

    for (const tx of uncategorised) {
      const description = tx.description || tx.name || '';

      // Try AI first
      await this.applyAiPrediction(tx, description, userId ?? '');

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
        const description = tx.description || tx.name || '';
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
   * Includes all system-default categories and any business-specific overrides/additions.
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

    return query
      .orderBy('category.type', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('subCategory.name', 'ASC')
      .getMany();
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
  ): Promise<void> {
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
        // AI returns a sub-category name
        const sub = await this.subCategoryRepo.findOne({
          where: { name: predicted.category },
          relations: ['category'],
        });

        if (sub) {
          tx.subCategory = sub.name;
          tx.subCategoryId = sub.id;
          tx.category = sub.category.type as TransactionCategory;
          tx.categoryId = sub.category.id;
          tx.isCategorised = true;
        } else {
          // Fallback if AI name doesn't match our dynamic list
          tx.category = predicted.category as TransactionCategory;
          tx.isCategorised = true;
        }

        tx.aiCategory = predicted.category;
        tx.categorySource = CategorySource.AI;

        this.logger.debug(
          `AI auto-applied "${predicted.category}" (${(predicted.confidence * 100).toFixed(1)}%) to: "${description}"`,
        );
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
  }

  private applyRules(tx: Transaction, rules: CategorizationRule[]) {
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
        break;
      }
    }
  }

  async applyRuleRetroactively(rule: CategorizationRule): Promise<number> {
    let query = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId: rule.businessId })
      .andWhere('tx.isCategorised = :isCat', { isCat: false });

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
    await this.transactionRepository.update(ids, {
      category: rule.category as TransactionCategory,
      subCategory: rule.subCategory,
      ruleId: rule.id,
      categorySource: CategorySource.RULE,
      isCategorised: true,
    });

    return ids.length;
  }
}

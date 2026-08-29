import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CategorizationRule,
  MatchType,
} from '../../finance/entities/categorization-rule.entity';
import { normalizeCategorizationSubCategory } from '../../finance/categorization-subcategories';
import {
  AccountCategory,
  AccountCategoryType,
} from '../../finance/entities/account-category.entity';
import { AccountSubCategory } from '../../finance/entities/account-subcategory.entity';
import {
  CategorizationRuleQueryDto,
  CreateAdminCategorizationRuleDto,
  UpdateAdminCategorizationRuleDto,
} from '../dto';

@Injectable()
export class AdminCategorizationRulesService {
  constructor(
    @InjectRepository(CategorizationRule)
    private readonly rulesRepository: Repository<CategorizationRule>,
    @InjectRepository(AccountCategory)
    private readonly categoriesRepository: Repository<AccountCategory>,
    @InjectRepository(AccountSubCategory)
    private readonly subCategoriesRepository: Repository<AccountSubCategory>,
  ) {}

  async listRules(query: CategorizationRuleQueryDto) {
    const { search, category, isActive, page = 1, limit = 20 } = query;
    const qb = this.rulesRepository
      .createQueryBuilder('rule')
      .where('rule.isSystem = true')
      .orderBy('rule.category', 'ASC')
      .addOrderBy('rule.priority', 'ASC')
      .addOrderBy('rule.matchValue', 'ASC');

    if (search) {
      qb.andWhere(
        '(rule.category ILIKE :search OR rule.subCategory ILIKE :search OR rule.matchValue ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (category) {
      qb.andWhere('rule.category = :category', { category });
    }

    if (isActive !== undefined) {
      qb.andWhere('rule.isActive = :isActive', { isActive });
    }

    const rules = await qb.getMany();
    const grouped = this.groupRules(rules);
    const total = grouped.length;
    const start = (page - 1) * limit;
    const paged = grouped.slice(start, start + limit);

    return {
      rules: paged,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createRule(dto: CreateAdminCategorizationRuleDto) {
    const keywords = this.normalizeKeywords(dto.keywords);
    const catalog = await this.resolveCatalogNames(
      dto.category,
      dto.subCategory || dto.category,
      dto.categoryType,
    );
    const category = catalog.category.type;
    const subCategory = catalog.subCategory.name;
    const existing = await this.findExistingKeywordRules(
      category,
      subCategory,
      keywords,
    );
    const existingKeywords = new Set(
      existing.map((rule) => rule.matchValue.trim().toLowerCase()),
    );
    const missingKeywords = keywords.filter(
      (keyword) => !existingKeywords.has(keyword.toLowerCase()),
    );

    const rules = missingKeywords.map((keyword) =>
      this.rulesRepository.create({
        isSystem: true,
        matchType: MatchType.CONTAINS,
        matchValue: keyword,
        category,
        subCategory,
        priority: dto.priority ?? 100,
        isActive: dto.isActive ?? true,
        businessId: null,
      }),
    );

    const saved =
      rules.length > 0 ? await this.rulesRepository.save(rules) : [];
    return this.groupRules([...existing, ...saved])[0];
  }

  async updateRuleGroup(id: string, dto: UpdateAdminCategorizationRuleDto) {
    const anchor = await this.rulesRepository.findOne({ where: { id } });
    if (!anchor) throw new NotFoundException('Categorization rule not found');

    const targetCategory = dto.category || anchor.category;
    const catalog = await this.resolveCatalogNames(
      targetCategory,
      dto.subCategory || anchor.subCategory,
      dto.categoryType,
    );
    const normalizedCategory = catalog.category.type;
    const targetSubCategory = catalog.subCategory.name;
    const related = await this.findRelatedRules(anchor);

    if (dto.keywords) {
      await this.rulesRepository.remove(related);
      return this.createRule({
        category: normalizedCategory,
        subCategory: targetSubCategory,
        keywords: dto.keywords,
        priority: dto.priority ?? anchor.priority,
        isActive: dto.isActive ?? anchor.isActive,
      });
    }

    for (const rule of related) {
      rule.category = normalizedCategory;
      rule.subCategory = targetSubCategory;
      if (dto.priority !== undefined) rule.priority = dto.priority;
      if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    }

    const saved = await this.rulesRepository.save(related);
    return this.groupRules(saved)[0];
  }

  async deleteRuleGroup(id: string) {
    const anchor = await this.rulesRepository.findOne({ where: { id } });
    if (!anchor) throw new NotFoundException('Categorization rule not found');

    const related = await this.findRelatedRules(anchor);

    await this.rulesRepository.remove(related);
    return { message: 'Categorization rule deleted successfully', id };
  }

  private normalizeKeywords(keywords: string[]) {
    const normalized = new Map<string, string>();

    keywords
      .flatMap((keyword) => keyword.split(','))
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .forEach((keyword) => {
        const key = keyword.toLowerCase();
        if (!normalized.has(key)) normalized.set(key, keyword);
      });

    return Array.from(normalized.values());
  }

  private async resolveCatalogNames(
    categoryValue: string,
    subCategoryValue: string,
    requestedType?: AccountCategoryType,
  ) {
    const categories = await this.categoriesRepository.find();
    const normalizedCategoryValue = this.normalizeLabel(categoryValue);
    const enumType = this.toCategoryType(normalizedCategoryValue);
    const category =
      this.findClosestLabel(
        normalizedCategoryValue,
        categories,
        (item) => item.name,
      ) ||
      (enumType
        ? categories.find((item) => item.isSystem && item.type === enumType) ||
          categories.find((item) => item.type === enumType)
        : undefined) ||
      (await this.categoriesRepository.save(
        this.categoriesRepository.create({
          name: this.toDisplayLabel(normalizedCategoryValue),
          type: requestedType || enumType || AccountCategoryType.EXPENSE,
          isSystem: true,
        }),
      ));

    const requestedSubCategory = normalizeCategorizationSubCategory(
      this.normalizeLabel(subCategoryValue),
    );
    const existingSubCategories = await this.subCategoriesRepository.find({
      where: { categoryId: category.id },
    });
    const subCategory =
      this.findClosestLabel(
        requestedSubCategory,
        existingSubCategories,
        (item) => item.name,
      ) ||
      (await this.subCategoriesRepository.save(
        this.subCategoriesRepository.create({
          name: this.toDisplayLabel(requestedSubCategory),
          categoryId: category.id,
          isSystem: true,
        }),
      ));

    return { category, subCategory };
  }

  private normalizeLabel(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  private toDisplayLabel(value: string) {
    if (value !== value.toLowerCase() && value !== value.toUpperCase()) {
      return value;
    }
    return value
      .toLowerCase()
      .replace(/\b\p{L}/gu, (character) => character.toUpperCase());
  }

  private toCategoryType(value: string): AccountCategoryType | undefined {
    const normalized = this.comparisonKey(value);
    return Object.values(AccountCategoryType).find(
      (type) => this.comparisonKey(type) === normalized,
    );
  }

  private findClosestLabel<T>(
    requested: string,
    candidates: T[],
    getLabel: (candidate: T) => string,
  ): T | undefined {
    const requestedKey = this.comparisonKey(requested);
    const exact = candidates.find(
      (candidate) => this.comparisonKey(getLabel(candidate)) === requestedKey,
    );
    if (exact) return exact;
    if (requestedKey.length < 5) return undefined;

    const ranked = candidates
      .map((candidate) => ({
        candidate,
        distance: this.levenshtein(
          requestedKey,
          this.comparisonKey(getLabel(candidate)),
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    const threshold = requestedKey.length <= 8 ? 1 : 2;
    if (
      !ranked[0] ||
      ranked[0].distance > threshold ||
      ranked[0].distance === ranked[1]?.distance
    ) {
      return undefined;
    }
    return ranked[0].candidate;
  }

  private comparisonKey(value: string) {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  private levenshtein(left: string, right: string) {
    const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
    for (let i = 1; i <= left.length; i++) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= right.length; j++) {
        const above = previous[j];
        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
        );
        diagonal = above;
      }
    }
    return previous[right.length];
  }

  private findExistingKeywordRules(
    category: string,
    subCategory: string,
    keywords: string[],
  ) {
    if (keywords.length === 0) return Promise.resolve([]);

    return this.rulesRepository
      .createQueryBuilder('rule')
      .where('rule.isSystem = true')
      .andWhere('rule.businessId IS NULL')
      .andWhere('rule.matchType = :matchType', {
        matchType: MatchType.CONTAINS,
      })
      .andWhere('LOWER(rule.category) = LOWER(:category)', { category })
      .andWhere('LOWER(rule.subCategory) = LOWER(:subCategory)', {
        subCategory,
      })
      .andWhere('LOWER(rule.matchValue) IN (:...keywords)', {
        keywords: keywords.map((keyword) => keyword.toLowerCase()),
      })
      .orderBy('rule.createdAt', 'ASC')
      .getMany();
  }

  private findRelatedRules(anchor: CategorizationRule) {
    const qb = this.rulesRepository
      .createQueryBuilder('rule')
      .where('rule.isSystem = :isSystem', { isSystem: anchor.isSystem })
      .andWhere('rule.category = :category', { category: anchor.category })
      .andWhere('rule.subCategory = :subCategory', {
        subCategory: anchor.subCategory,
      })
      .orderBy('rule.priority', 'ASC')
      .addOrderBy('rule.matchValue', 'ASC');

    if (anchor.businessId) {
      qb.andWhere('rule.businessId = :businessId', {
        businessId: anchor.businessId,
      });
    } else {
      qb.andWhere('rule.businessId IS NULL');
    }

    return qb.getMany();
  }

  private groupRules(rules: CategorizationRule[]) {
    const groups = new Map<string, CategorizationRule[]>();

    for (const rule of rules) {
      const subCategory = normalizeCategorizationSubCategory(rule.subCategory);
      const key = `${rule.category}:${subCategory}:${rule.businessId || 'system'}`;
      groups.set(key, [...(groups.get(key) || []), rule]);
    }

    return Array.from(groups.values()).map((group) => {
      const first = group[0];
      return {
        id: first.id,
        category: first.category,
        subCategory: normalizeCategorizationSubCategory(first.subCategory),
        keywords: Array.from(new Set(group.map((rule) => rule.matchValue))),
        priority: first.priority,
        isActive: group.some((rule) => rule.isActive),
        ruleIds: group.map((rule) => rule.id),
        createdAt: first.createdAt,
        updatedAt: group.reduce(
          (latest, rule) => (rule.updatedAt > latest ? rule.updatedAt : latest),
          first.updatedAt,
        ),
      };
    });
  }
}

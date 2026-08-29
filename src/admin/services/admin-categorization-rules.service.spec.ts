import { MatchType } from '../../finance/entities/categorization-rule.entity';
import { AccountCategoryType } from '../../finance/entities/account-category.entity';
import { AdminCategorizationRulesService } from './admin-categorization-rules.service';

function createQueryBuilder(existing: any[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(existing),
  };
}

function createCatalogRepositories() {
  const category = {
    id: 'expense-id',
    name: 'Expenses',
    type: AccountCategoryType.EXPENSE,
    isSystem: true,
  };
  const subCategory = {
    id: 'salary-id',
    name: 'Salaries & Wages',
    categoryId: category.id,
    isSystem: true,
  };
  return {
    categoriesRepository: {
      find: jest.fn().mockResolvedValue([category]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'new-category-id', ...value })),
    },
    subCategoriesRepository: {
      find: jest.fn().mockResolvedValue([subCategory]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'new-subcategory-id', ...value })),
    },
  };
}

describe('AdminCategorizationRulesService', () => {
  it('returns the existing group without creating duplicate keywords', async () => {
    const existing = {
      id: 'existing-id',
      isSystem: true,
      matchType: MatchType.CONTAINS,
      matchValue: 'salary',
      category: 'EXPENSE',
      subCategory: 'Salaries & Wages',
      priority: 20,
      isActive: true,
      businessId: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilder([existing])),
      create: jest.fn(),
      save: jest.fn(),
    };
    const catalog = createCatalogRepositories();
    const service = new AdminCategorizationRulesService(
      repository as any,
      catalog.categoriesRepository as any,
      catalog.subCategoriesRepository as any,
    );

    const result = await service.createRule({
      category: 'EXPENSE',
      subCategory: 'Salary and Wages',
      keywords: ['salary', 'Salary'],
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: existing.id,
        subCategory: 'Salaries & Wages',
        keywords: ['salary'],
      }),
    );
  });

  it('creates only keywords missing from an existing group', async () => {
    const existing = {
      id: 'existing-id',
      isSystem: true,
      matchType: MatchType.CONTAINS,
      matchValue: 'salary',
      category: 'EXPENSE',
      subCategory: 'Salaries & Wages',
      priority: 20,
      isActive: true,
      businessId: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilder([existing])),
      create: jest.fn().mockImplementation((value) => ({
        id: 'new-id',
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
        ...value,
      })),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const catalog = createCatalogRepositories();
    const service = new AdminCategorizationRulesService(
      repository as any,
      catalog.categoriesRepository as any,
      catalog.subCategoriesRepository as any,
    );

    const result = await service.createRule({
      category: 'EXPENSE',
      subCategory: 'Wages & Salaries',
      keywords: ['salary', 'bonus'],
      priority: 30,
    });

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        matchValue: 'bonus',
        subCategory: 'Salaries & Wages',
      }),
    );
    expect(result.keywords).toEqual(['salary', 'bonus']);
  });

  it('reuses an existing subcategory for a small spelling mismatch', async () => {
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([])),
      create: jest.fn().mockImplementation((value) => ({
        id: 'new-rule-id',
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
        ...value,
      })),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const catalog = createCatalogRepositories();
    const service = new AdminCategorizationRulesService(
      repository as any,
      catalog.categoriesRepository as any,
      catalog.subCategoriesRepository as any,
    );

    const result = await service.createRule({
      category: 'expenses',
      subCategory: 'Salaries & Wage',
      keywords: ['payroll'],
    });

    expect(catalog.categoriesRepository.save).not.toHaveBeenCalled();
    expect(catalog.subCategoriesRepository.save).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        category: AccountCategoryType.EXPENSE,
        subCategory: 'Salaries & Wages',
      }),
    );
  });

  it('creates a new category and subcategory from names in the same request', async () => {
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([])),
      create: jest.fn().mockImplementation((value) => ({
        id: 'new-rule-id',
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
        ...value,
      })),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const catalog = createCatalogRepositories();
    const service = new AdminCategorizationRulesService(
      repository as any,
      catalog.categoriesRepository as any,
      catalog.subCategoriesRepository as any,
    );

    const result = await service.createRule({
      category: 'freelance income',
      categoryType: AccountCategoryType.INCOME,
      subCategory: 'consulting services',
      keywords: ['consulting'],
    });

    expect(catalog.categoriesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Freelance Income',
        type: AccountCategoryType.INCOME,
      }),
    );
    expect(catalog.subCategoriesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Consulting Services',
        categoryId: 'new-category-id',
      }),
    );
    expect(result.category).toBe(AccountCategoryType.INCOME);
  });
});

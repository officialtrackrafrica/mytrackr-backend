import { MatchType } from '../../finance/entities/categorization-rule.entity';
import { AccountCategoryType } from '../../finance/entities/account-category.entity';
import { AdminCategorizationRulesService } from './admin-categorization-rules.service';

function createQueryBuilder(existing: any[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
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

describe('Admin rule category paths and accounting types', () => {
  function setup() {
    const categories = Object.values(AccountCategoryType).map((type) => ({
      id: `${type}-id`,
      type,
      isSystem: true,
      name:
        type === AccountCategoryType.COGS ? 'Selling/Production Cost' : type,
    }));
    const subCategories = [
      {
        id: 'packaging-id',
        name: 'Packaging Cost',
        categoryId: 'COGS-id',
        isSystem: true,
      },
    ];
    const categoryRepository = {
      find: jest.fn(async () => categories),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const saved = { id: `category-${categories.length}`, ...value };
        categories.push(saved);
        return saved;
      }),
    };
    const subCategoryRepository = {
      find: jest.fn(async ({ where }) =>
        subCategories.filter((sub) => sub.categoryId === where.categoryId),
      ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const saved = { id: `sub-${subCategories.length}`, ...value };
        subCategories.push(saved);
        return saved;
      }),
    };
    const qb = createQueryBuilder([]);
    const rulesRepository = {
      createQueryBuilder: jest.fn(() => qb),
      create: jest.fn((value) => ({
        id: 'rule-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...value,
      })),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminCategorizationRulesService(
      rulesRepository as any,
      categoryRepository as any,
      subCategoryRepository as any,
    );
    return {
      service,
      categories,
      subCategories,
      categoryRepository,
      subCategoryRepository,
      rulesRepository,
      qb,
    };
  }

  it('resolves the reported COGS / Packaging Cost payload without creating an Expense category', async () => {
    const { service, categoryRepository, subCategoryRepository } = setup();
    const result = await service.createRule({
      category: 'COGS / Packaging Cost',
      keywords: ['purchase'],
    });
    expect(result).toMatchObject({
      category: AccountCategoryType.COGS,
      subCategory: 'Packaging Cost',
      keywords: ['purchase'],
    });
    expect(categoryRepository.save).not.toHaveBeenCalled();
    expect(subCategoryRepository.save).not.toHaveBeenCalled();
    expect(subCategoryRepository.find).toHaveBeenCalledWith({
      where: { categoryId: 'COGS-id' },
    });
  });

  it.each(Object.values(AccountCategoryType))(
    'creates a subcategory under the selected %s parent',
    async (type) => {
      const { service, categoryRepository, subCategoryRepository } = setup();
      const result = await service.createRule({
        category: `${type} / Custom Detail`,
        keywords: ['keyword'],
      });
      expect(result).toMatchObject({
        category: type,
        subCategory: 'Custom Detail',
      });
      expect(categoryRepository.save).not.toHaveBeenCalled();
      expect(subCategoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: `${type}-id`,
          name: 'Custom Detail',
        }),
      );
    },
  );

  it('prefers the recognized parent over a previously mis-created composite Expense category', async () => {
    const { service, categories, categoryRepository } = setup();
    categories.push({
      id: 'wrong',
      name: 'COGS / Packaging Cost',
      type: AccountCategoryType.EXPENSE,
      isSystem: true,
    });
    const result = await service.createRule({
      category: 'COGS / Packaging Cost',
      keywords: ['purchase'],
    });
    expect(result.category).toBe(AccountCategoryType.COGS);
    expect(categoryRepository.save).not.toHaveBeenCalled();
  });

  it.each([
    { category: 'Selling/Production Cost / Packaging Cost' },
    { category: 'Selling/Production Cost', subCategory: 'Packaging Cost' },
    { category: 'COGS/Packaging Cost' },
    { category: 'COGS / Packaging Cost', subCategory: 'Packaging Cost' },
  ])(
    'supports category names containing slashes and the separate-field form: %j',
    async (payload) => {
      const { service } = setup();
      expect(
        await service.createRule({ ...payload, keywords: ['purchase'] }),
      ).toMatchObject({ category: 'COGS', subCategory: 'Packaging Cost' });
    },
  );

  it('keeps slashes within subcategory names', async () => {
    const { service } = setup();
    expect(
      await service.createRule({
        category: 'EXPENSE / Marketing/Advertising',
        keywords: ['advert'],
      }),
    ).toMatchObject({
      category: 'EXPENSE',
      subCategory: 'Marketing/Advertising',
    });
  });

  it('does not let a wrongly typed category named COGS override the COGS accounting type', async () => {
    const { service, categories } = setup();
    categories.unshift({
      id: 'wrong-type',
      name: 'COGS',
      type: AccountCategoryType.EXPENSE,
      isSystem: true,
    });
    expect(
      await service.createRule({
        category: 'COGS / Packaging Cost',
        keywords: ['purchase'],
      }),
    ).toMatchObject({ category: 'COGS', subCategory: 'Packaging Cost' });
  });

  it('keeps a new named parent when replacing keywords during a category change', async () => {
    const { service, rulesRepository, qb, subCategoryRepository } = setup();
    const anchor = {
      id: 'anchor',
      category: 'EXPENSE',
      subCategory: 'Old Detail',
      businessId: null,
      priority: 100,
      isSystem: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    rulesRepository.findOne.mockResolvedValue(anchor);
    qb.getMany.mockResolvedValueOnce([anchor]).mockResolvedValue([]);
    const result = await service.updateRuleGroup('anchor', {
      category: 'Custom Direct Costs / Raw Materials',
      categoryType: AccountCategoryType.COGS,
      keywords: ['materials'],
    });
    expect(result).toMatchObject({
      category: 'COGS',
      subCategory: 'Raw Materials',
    });
    expect(subCategoryRepository.save).toHaveBeenCalledTimes(1);
    expect(subCategoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 'category-7',
        name: 'Raw Materials',
      }),
    );
  });

  it('requires an accounting type for unknown new categories instead of defaulting to Expense', async () => {
    const { service, categoryRepository, subCategoryRepository } = setup();
    await expect(
      service.createRule({
        category: 'Retail costs / Shipping',
        keywords: ['shipping'],
      }),
    ).rejects.toThrow('categoryType is required');
    expect(categoryRepository.save).not.toHaveBeenCalled();
    expect(subCategoryRepository.save).not.toHaveBeenCalled();
  });

  it('creates a new named parent with the explicitly supplied type', async () => {
    const { service, categoryRepository, subCategoryRepository } = setup();
    const result = await service.createRule({
      category: 'Retail costs / Shipping',
      categoryType: AccountCategoryType.COGS,
      keywords: ['shipping'],
    });
    expect(result).toMatchObject({ category: 'COGS', subCategory: 'Shipping' });
    expect(categoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Retail costs', type: 'COGS' }),
    );
    expect(subCategoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Shipping', categoryId: 'category-7' }),
    );
  });

  it('rejects conflicting accounting types or subcategory labels before catalog writes', async () => {
    const { service, categoryRepository, subCategoryRepository } = setup();
    await expect(
      service.createRule({
        category: 'COGS / Packaging Cost',
        categoryType: AccountCategoryType.EXPENSE,
        keywords: ['purchase'],
      }),
    ).rejects.toThrow('categoryType conflicts');
    await expect(
      service.createRule({
        category: 'COGS / Packaging Cost',
        subCategory: 'Other',
        keywords: ['purchase'],
      }),
    ).rejects.toThrow('subCategory conflicts');
    expect(categoryRepository.save).not.toHaveBeenCalled();
    expect(subCategoryRepository.save).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'moves an existing group to the correct path when replacing keywords=%s',
    async (replaceKeywords) => {
      const { service, rulesRepository, qb } = setup();
      const anchor = {
        id: 'anchor',
        category: 'EXPENSE',
        subCategory: 'Old Detail',
        businessId: null,
        priority: 100,
        isSystem: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rulesRepository.findOne.mockResolvedValue(anchor);
      qb.getMany.mockResolvedValueOnce([anchor]).mockResolvedValue([]);
      const result = await service.updateRuleGroup('anchor', {
        category: 'COGS / Packaging Cost',
        ...(replaceKeywords ? { keywords: ['purchase'] } : {}),
      });
      expect(result).toMatchObject({
        category: 'COGS',
        subCategory: 'Packaging Cost',
      });
    },
  );

  it('retains the existing subcategory when updating unrelated rule properties', async () => {
    const { service, rulesRepository, qb } = setup();
    const anchor = {
      id: 'anchor',
      category: 'COGS',
      subCategory: 'Packaging Cost',
      businessId: null,
      priority: 100,
      isSystem: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    rulesRepository.findOne.mockResolvedValue(anchor);
    qb.getMany.mockResolvedValue([anchor]);
    const result = await service.updateRuleGroup('anchor', { priority: 20 });
    expect(result).toMatchObject({
      category: 'COGS',
      subCategory: 'Packaging Cost',
      priority: 20,
    });
  });
});

import { FinancialCategoriesSeed } from './financial-categories.seed';

describe('FinancialCategoriesSeed', () => {
  it('seeds licenses and permits and refund/reversal subcategories', async () => {
    const categoryRepo = {
      delete: jest.fn(),
      findOne: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          id: `category-${where.name}`,
          name: where.name,
          type: where.type,
        }),
      ),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const subCategoryRepo = {
      delete: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const seed = new FinancialCategoriesSeed(
      categoryRepo as any,
      subCategoryRepo as any,
    );

    await seed.run();

    expect(subCategoryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Licenses and permits',
        categoryId: 'category-Expenses',
      }),
    );
    expect(subCategoryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Refund and Reversal',
        categoryId: 'category-Internal Transfers',
      }),
    );
  });
});

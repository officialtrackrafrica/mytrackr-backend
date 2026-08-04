import { MatchType } from '../../finance/entities/categorization-rule.entity';
import { AdminCategorizationRulesService } from './admin-categorization-rules.service';

function createQueryBuilder(existing: any[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(existing),
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
    const service = new AdminCategorizationRulesService(repository as any);

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
    const service = new AdminCategorizationRulesService(repository as any);

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
});

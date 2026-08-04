import { NotFoundException } from '@nestjs/common';
import { LearningHubService } from './learning-hub.service';

describe('LearningHubService', () => {
  it('creates an article with an admin-managed category', async () => {
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'article-id', ...value })),
    };
    const service = new LearningHubService(repository as any);

    const result = await service.createArticle('admin-id', {
      title: '  Understanding cash flow  ',
      body: '  Educational content  ',
      link: '  https://mytrackr.com/learn/cash-flow  ',
      category: '  Cash Flow  ',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'article-id',
        title: 'Understanding cash flow',
        body: 'Educational content',
        link: 'https://mytrackr.com/learn/cash-flow',
        category: 'Cash Flow',
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      }),
    );
  });

  it('updates an article category and content', async () => {
    const article = {
      id: 'article-id',
      title: 'Cash flow',
      body: 'Old body',
      link: '/learn/cash-flow',
      category: 'Basics',
      updatedBy: 'first-admin',
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(article),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const service = new LearningHubService(repository as any);

    const result = await service.updateArticle('article-id', 'admin-id', {
      body: 'New body',
      category: 'Cash Flow',
    });

    expect(result.body).toBe('New body');
    expect(result.category).toBe('Cash Flow');
    expect(result.updatedBy).toBe('admin-id');
  });

  it('supports public search and category filtering', async () => {
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new LearningHubService(repository as any);

    await service.listArticles({
      search: 'cash',
      category: 'Cash Flow',
      page: 2,
      limit: 10,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2);
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('returns 404 for an unknown article', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new LearningHubService(repository as any);

    await expect(service.getArticle('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});

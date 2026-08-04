import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminTermsService } from './admin-terms.service';

describe('AdminTermsService', () => {
  it('generates the next version and creates a draft', async () => {
    const repository = {
      maximum: jest.fn().mockResolvedValue(2),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'terms-id', ...value })),
    };
    const service = new AdminTermsService(repository as any);

    const result = await service.createTerms('admin-id', {
      title: 'Terms and Conditions',
      content: 'Version three content',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'terms-id',
        version: 3,
        status: 'draft',
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      }),
    );
  });

  it('publishes a draft with a backend publication timestamp', async () => {
    const draft = {
      id: 'terms-id',
      version: 1,
      status: 'draft',
      effectiveAt: null,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(draft),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const service = new AdminTermsService(repository as any);

    const result = await service.publishTerms('terms-id', 'admin-id', {});

    expect(result.status).toBe('published');
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.effectiveAt).toBeInstanceOf(Date);
    expect(result.updatedBy).toBe('admin-id');
  });

  it('prevents editing or deleting a published version', async () => {
    const published = { id: 'terms-id', status: 'published' };
    const repository = {
      findOne: jest.fn().mockResolvedValue(published),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const service = new AdminTermsService(repository as any);

    await expect(
      service.updateTerms('terms-id', 'admin-id', { title: 'Changed' }),
    ).rejects.toThrow(ConflictException);
    await expect(service.deleteTerms('terms-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('returns 404 when there is no currently effective published version', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new AdminTermsService(repository as any);

    await expect(service.getCurrentTerms()).rejects.toThrow(NotFoundException);
  });
});

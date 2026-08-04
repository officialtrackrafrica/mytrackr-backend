import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminPrivacyPolicyService } from './admin-privacy-policy.service';

describe('AdminPrivacyPolicyService', () => {
  it('generates the next version and creates a draft', async () => {
    const repository = {
      maximum: jest.fn().mockResolvedValue(4),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'policy-id', ...value })),
    };
    const service = new AdminPrivacyPolicyService(repository as any);

    const result = await service.createPolicy('admin-id', {
      title: 'Privacy Policy',
      content: 'Version five content',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'policy-id',
        version: 5,
        status: 'draft',
        createdBy: 'admin-id',
        updatedBy: 'admin-id',
      }),
    );
  });

  it('publishes a draft with publication and effective timestamps', async () => {
    const draft = {
      id: 'policy-id',
      version: 1,
      status: 'draft',
      effectiveAt: null,
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(draft),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const service = new AdminPrivacyPolicyService(repository as any);

    const result = await service.publishPolicy('policy-id', 'admin-id', {});

    expect(result.status).toBe('published');
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.effectiveAt).toBeInstanceOf(Date);
    expect(result.updatedBy).toBe('admin-id');
  });

  it('prevents editing or deleting a published version', async () => {
    const published = { id: 'policy-id', status: 'published' };
    const repository = {
      findOne: jest.fn().mockResolvedValue(published),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const service = new AdminPrivacyPolicyService(repository as any);

    await expect(
      service.updatePolicy('policy-id', 'admin-id', { title: 'Changed' }),
    ).rejects.toThrow(ConflictException);
    await expect(service.deletePolicy('policy-id')).rejects.toThrow(
      ConflictException,
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('returns 404 when no privacy policy is currently effective', async () => {
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
    const service = new AdminPrivacyPolicyService(repository as any);

    await expect(service.getCurrentPolicy()).rejects.toThrow(NotFoundException);
  });
});

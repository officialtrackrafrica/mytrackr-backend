import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivacyPolicyDocument } from '../entities/privacy-policy-document.entity';
import {
  CreatePrivacyPolicyDto,
  PrivacyPolicyHistoryQueryDto,
  PublishPrivacyPolicyDto,
  UpdatePrivacyPolicyDto,
} from '../dto/privacy-policy.dto';

@Injectable()
export class AdminPrivacyPolicyService {
  constructor(
    @InjectRepository(PrivacyPolicyDocument)
    private readonly policyRepository: Repository<PrivacyPolicyDocument>,
  ) {}

  async getCurrentPolicy() {
    const policy = await this.policyRepository
      .createQueryBuilder('policy')
      .where('policy.status = :status', { status: 'published' })
      .andWhere('policy.effectiveAt <= :now', { now: new Date() })
      .orderBy('policy.effectiveAt', 'DESC')
      .addOrderBy('policy.version', 'DESC')
      .getOne();

    if (!policy)
      throw new NotFoundException('Published privacy policy not found');
    return this.toPublicResponse(policy);
  }

  async listPolicies(query: PrivacyPolicyHistoryQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const qb = this.policyRepository
      .createQueryBuilder('policy')
      .orderBy('policy.version', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('policy.status = :status', { status });

    const [policies, total] = await qb.getManyAndCount();
    return {
      policies,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createPolicy(adminId: string, dto: CreatePrivacyPolicyDto) {
    const highestVersion = await this.policyRepository.maximum('version');
    const policy = this.policyRepository.create({
      version: Number(highestVersion || 0) + 1,
      title: dto.title,
      content: dto.content,
      status: 'draft',
      effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
      publishedAt: null,
      createdBy: adminId,
      updatedBy: adminId,
    });
    return this.policyRepository.save(policy);
  }

  async updatePolicy(id: string, adminId: string, dto: UpdatePrivacyPolicyDto) {
    const policy = await this.findPolicy(id);
    this.assertDraft(policy, 'Only draft privacy policies can be edited');

    if (dto.title !== undefined) policy.title = dto.title;
    if (dto.content !== undefined) policy.content = dto.content;
    if (dto.effectiveAt !== undefined) {
      policy.effectiveAt = new Date(dto.effectiveAt);
    }
    policy.updatedBy = adminId;
    return this.policyRepository.save(policy);
  }

  async publishPolicy(
    id: string,
    adminId: string,
    dto: PublishPrivacyPolicyDto,
  ) {
    const policy = await this.findPolicy(id);
    this.assertDraft(policy, 'Only draft privacy policies can be published');

    const now = new Date();
    policy.status = 'published';
    policy.publishedAt = now;
    policy.effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : policy.effectiveAt || now;
    policy.updatedBy = adminId;
    return this.policyRepository.save(policy);
  }

  async deletePolicy(id: string) {
    const policy = await this.findPolicy(id);
    this.assertDraft(policy, 'Only draft privacy policies can be deleted');
    await this.policyRepository.remove(policy);
    return { message: 'Privacy policy draft deleted successfully', id };
  }

  private async findPolicy(id: string) {
    const policy = await this.policyRepository.findOne({ where: { id } });
    if (!policy)
      throw new NotFoundException('Privacy policy version not found');
    return policy;
  }

  private assertDraft(policy: PrivacyPolicyDocument, message: string) {
    if (policy.status !== 'draft') throw new ConflictException(message);
  }

  private toPublicResponse(policy: PrivacyPolicyDocument) {
    return {
      id: policy.id,
      version: policy.version,
      title: policy.title,
      content: policy.content,
      effectiveAt: policy.effectiveAt,
      publishedAt: policy.publishedAt,
      updatedAt: policy.updatedAt,
    };
  }
}

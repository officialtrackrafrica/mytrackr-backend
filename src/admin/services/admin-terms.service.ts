import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TermsDocument } from '../entities/terms-document.entity';
import {
  CreateTermsDto,
  PublishTermsDto,
  TermsHistoryQueryDto,
  UpdateTermsDto,
} from '../dto/terms.dto';

@Injectable()
export class AdminTermsService {
  constructor(
    @InjectRepository(TermsDocument)
    private readonly termsRepository: Repository<TermsDocument>,
  ) {}

  async getCurrentTerms() {
    const terms = await this.termsRepository
      .createQueryBuilder('terms')
      .where('terms.status = :status', { status: 'published' })
      .andWhere('terms.effectiveAt <= :now', { now: new Date() })
      .orderBy('terms.effectiveAt', 'DESC')
      .addOrderBy('terms.version', 'DESC')
      .getOne();

    if (!terms) throw new NotFoundException('Published terms not found');
    return this.toPublicResponse(terms);
  }

  async listTerms(query: TermsHistoryQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const qb = this.termsRepository
      .createQueryBuilder('terms')
      .orderBy('terms.version', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere('terms.status = :status', { status });

    const [terms, total] = await qb.getManyAndCount();
    return {
      terms,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createTerms(adminId: string, dto: CreateTermsDto) {
    const highestVersion = await this.termsRepository.maximum('version');
    const terms = this.termsRepository.create({
      version: Number(highestVersion || 0) + 1,
      title: dto.title,
      content: dto.content,
      status: 'draft',
      effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
      publishedAt: null,
      createdBy: adminId,
      updatedBy: adminId,
    });
    return this.termsRepository.save(terms);
  }

  async updateTerms(id: string, adminId: string, dto: UpdateTermsDto) {
    const terms = await this.findTerms(id);
    this.assertDraft(terms, 'Only draft terms can be edited');

    if (dto.title !== undefined) terms.title = dto.title;
    if (dto.content !== undefined) terms.content = dto.content;
    if (dto.effectiveAt !== undefined) {
      terms.effectiveAt = new Date(dto.effectiveAt);
    }
    terms.updatedBy = adminId;
    return this.termsRepository.save(terms);
  }

  async publishTerms(id: string, adminId: string, dto: PublishTermsDto) {
    const terms = await this.findTerms(id);
    this.assertDraft(terms, 'Only draft terms can be published');

    const now = new Date();
    terms.status = 'published';
    terms.publishedAt = now;
    terms.effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : terms.effectiveAt || now;
    terms.updatedBy = adminId;
    return this.termsRepository.save(terms);
  }

  async deleteTerms(id: string) {
    const terms = await this.findTerms(id);
    this.assertDraft(terms, 'Only draft terms can be deleted');
    await this.termsRepository.remove(terms);
    return { message: 'Terms draft deleted successfully', id };
  }

  private async findTerms(id: string) {
    const terms = await this.termsRepository.findOne({ where: { id } });
    if (!terms) throw new NotFoundException('Terms version not found');
    return terms;
  }

  private assertDraft(terms: TermsDocument, message: string) {
    if (terms.status !== 'draft') throw new ConflictException(message);
  }

  private toPublicResponse(terms: TermsDocument) {
    return {
      id: terms.id,
      version: terms.version,
      title: terms.title,
      content: terms.content,
      effectiveAt: terms.effectiveAt,
      publishedAt: terms.publishedAt,
      updatedAt: terms.updatedAt,
    };
  }
}

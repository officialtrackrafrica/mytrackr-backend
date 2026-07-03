import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faq } from '../entities/faq.entity';
import { CreateFaqDto, FaqQueryDto, UpdateFaqDto } from '../dto';

@Injectable()
export class AdminFaqService {
  constructor(
    @InjectRepository(Faq)
    private readonly faqRepository: Repository<Faq>,
  ) {}

  async listFaqs(query: FaqQueryDto) {
    const { search, page = 1, limit = 20 } = query;

    const qb = this.faqRepository
      .createQueryBuilder('faq')
      .orderBy('faq.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('(faq.question ILIKE :search OR faq.answer ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [faqs, total] = await qb.getManyAndCount();
    return {
      faqs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFaq(id: string) {
    const faq = await this.faqRepository.findOne({ where: { id } });
    if (!faq) throw new NotFoundException('FAQ not found');
    return faq;
  }

  async createFaq(adminId: string, dto: CreateFaqDto) {
    const faq = this.faqRepository.create({
      ...dto,
      createdBy: adminId,
      updatedBy: adminId,
    });

    return this.faqRepository.save(faq);
  }

  async updateFaq(id: string, adminId: string, dto: UpdateFaqDto) {
    const faq = await this.getFaq(id);

    Object.assign(faq, dto, { updatedBy: adminId });
    return this.faqRepository.save(faq);
  }

  async deleteFaq(id: string) {
    const faq = await this.getFaq(id);
    await this.faqRepository.remove(faq);
    return { message: 'FAQ deleted successfully', id };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningHubArticle } from '../entities/learning-hub-article.entity';
import {
  CreateLearningHubArticleDto,
  LearningHubQueryDto,
  UpdateLearningHubArticleDto,
} from '../dto/learning-hub.dto';

@Injectable()
export class LearningHubService {
  constructor(
    @InjectRepository(LearningHubArticle)
    private readonly articleRepository: Repository<LearningHubArticle>,
  ) {}

  async listArticles(query: LearningHubQueryDto) {
    const { search, category, page = 1, limit = 20 } = query;
    const qb = this.articleRepository
      .createQueryBuilder('article')
      .orderBy('article.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere(
        '(article.title ILIKE :search OR article.body ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (category) {
      qb.andWhere('article.category = :category', { category });
    }

    const [articles, total] = await qb.getManyAndCount();
    return {
      articles,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listCategories() {
    const rows = await this.articleRepository
      .createQueryBuilder('article')
      .select('article.category', 'category')
      .addSelect('COUNT(article.id)', 'articleCount')
      .groupBy('article.category')
      .orderBy('article.category', 'ASC')
      .getRawMany();

    return {
      categories: rows.map((row) => ({
        name: row.category,
        articleCount: Number.parseInt(row.articleCount, 10),
      })),
    };
  }

  async getArticle(id: string) {
    const article = await this.articleRepository.findOne({ where: { id } });
    if (!article) throw new NotFoundException('Learning Hub article not found');
    return article;
  }

  async createArticle(adminId: string, dto: CreateLearningHubArticleDto) {
    const article = this.articleRepository.create({
      title: dto.title.trim(),
      body: dto.body.trim(),
      link: dto.link.trim(),
      category: dto.category.trim(),
      createdBy: adminId,
      updatedBy: adminId,
    });
    return this.articleRepository.save(article);
  }

  async updateArticle(
    id: string,
    adminId: string,
    dto: UpdateLearningHubArticleDto,
  ) {
    const article = await this.getArticle(id);
    if (dto.title !== undefined) article.title = dto.title.trim();
    if (dto.body !== undefined) article.body = dto.body.trim();
    if (dto.link !== undefined) article.link = dto.link.trim();
    if (dto.category !== undefined) article.category = dto.category.trim();
    article.updatedBy = adminId;
    return this.articleRepository.save(article);
  }

  async deleteArticle(id: string) {
    const article = await this.getArticle(id);
    await this.articleRepository.remove(article);
    return { message: 'Learning Hub article deleted successfully', id };
  }
}

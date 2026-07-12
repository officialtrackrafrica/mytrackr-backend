import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AiCategorizationService } from './categorization.service';
import { CategorizationModule } from './categorization.module';
import { DEFAULT_CATEGORIZATION_RULES } from '../database/seeds/categorization-rules.seed';
import { MatchType } from '../finance/entities/categorization-rule.entity';

type TrainingExample = {
  narration: string;
  label: string;
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CategorizationModule],
})
class CategorizationPretrainingModule {}

const logger = new Logger('CategorizationPretraining');

function buildTrainingExamples(): TrainingExample[] {
  const examples = new Map<string, TrainingExample>();

  for (const rule of DEFAULT_CATEGORIZATION_RULES) {
    if (rule.matchType === MatchType.REGEX) {
      continue;
    }

    const keyword = normalizeNarration(rule.matchValue);
    const label = rule.subCategory || rule.category;
    const variants = [
      keyword,
      `payment ${keyword}`,
      `${keyword} payment`,
      `pos ${keyword}`,
      `card payment ${keyword}`,
      `transfer ${keyword}`,
      `online payment ${keyword}`,
      `debit ${keyword}`,
      `credit ${keyword}`,
      `${keyword} transaction`,
      `${keyword} invoice`,
      `${keyword} receipt`,
    ];

    for (const narration of variants) {
      const normalized = normalizeNarration(narration);
      const key = `${normalized}::${label}`;
      examples.set(key, { narration: normalized, label });
    }
  }

  return Array.from(examples.values());
}

function normalizeNarration(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    CategorizationPretrainingModule,
    { logger: ['log', 'warn', 'error'] },
  );

  try {
    const aiCategorizationService = app.get(AiCategorizationService);
    const examples = buildTrainingExamples();

    logger.log(
      `Pretraining categorization engine with ${examples.length} examples from ${DEFAULT_CATEGORIZATION_RULES.length} seed rules...`,
    );

    let trained = 0;

    for (const example of examples) {
      const learned = await aiCategorizationService.learnFeedback(
        example.narration,
        example.label,
        'system-pretraining',
      );
      if (learned) {
        trained++;
      }
    }

    if (trained !== examples.length) {
      throw new Error(
        `Only ${trained}/${examples.length} examples were accepted by the categorization engine.`,
      );
    }

    logger.log(`Categorization pretraining completed: ${trained} examples.`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  logger.error('Categorization pretraining failed', error.stack);
  process.exit(1);
});

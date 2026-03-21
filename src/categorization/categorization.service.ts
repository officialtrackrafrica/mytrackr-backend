import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

export interface PredictResponse {
  category: string;
  confidence: number;
}

interface CategorizationGrpcService {
  predictCategory(data: { narration: string; userId: string }): any;
  learnTransaction(data: {
    narration: string;
    correctCategory: string;
    userId: string;
  }): any;
}

@Injectable()
export class AiCategorizationService implements OnModuleInit {
  private readonly logger = new Logger(AiCategorizationService.name);
  private gRpcService: CategorizationGrpcService;

  constructor(@Inject('CATEGORIZATION_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.gRpcService = this.client.getService<CategorizationGrpcService>(
      'CategorizationService',
    );
  }

  async predict(
    narration: string,
    userId: string = '',
  ): Promise<PredictResponse> {
    try {
      this.logger.debug(`Requesting prediction for: ${narration}`);
      const response = await lastValueFrom(
        this.gRpcService.predictCategory({ narration, userId }),
      );
      return response as PredictResponse;
    } catch (error) {
      this.logger.error(
        `Failed to predict category via gRPC: ${error.message}`,
      );
      // Fallback
      return { category: 'Uncategorized', confidence: 0 };
    }
  }

  async learnFeedback(
    narration: string,
    correctCategory: string,
    userId: string = '',
  ): Promise<void> {
    try {
      this.logger.debug(`Sending feedback: ${narration} -> ${correctCategory}`);
      await lastValueFrom(
        this.gRpcService.learnTransaction({
          narration,
          correctCategory,
          userId,
        }),
      );
      this.logger.log(`Successfully learned feedback for: ${narration}`);
    } catch (error) {
      this.logger.error(`Failed to send feedback via gRPC: ${error.message}`);
    }
  }
}

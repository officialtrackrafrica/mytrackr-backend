import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationsService } from '../services/integrations.service';

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly integrationsService: IntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-mytrackr-api-key'];

    if (!apiKey || Array.isArray(apiKey)) {
      throw new UnauthorizedException('Missing integration API key');
    }

    request.integration =
      await this.integrationsService.authenticateApiKey(apiKey);
    return true;
  }
}

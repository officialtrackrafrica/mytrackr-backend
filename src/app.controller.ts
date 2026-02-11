import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_TAGS } from './common/docs';

@ApiTags(SWAGGER_TAGS[0].name)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'System Health Check',
    description: 'Returns a simple greeting to verify the service is running.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: { example: 'Hello World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}

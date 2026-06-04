import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCookieAuth,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { BusinessService } from './services/business.service';
import {
  UpdateBusinessDto,
  BusinessResponseDto,
  BusinessTypeOptionDto,
} from './dto';
import { SWAGGER_TAGS } from '../common/docs';
import { ErrorResponseDto } from '../common/errors';

@ApiTags(SWAGGER_TAGS[4].name)
@Controller('businesses')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('accessToken')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Public()
  @Get('types')
  @ApiOperation({ summary: 'Get available business types' })
  @ApiResponse({
    status: 200,
    description: 'Available business types',
    type: BusinessTypeOptionDto,
    isArray: true,
  })
  getBusinessTypes() {
    return this.businessService.getBusinessTypes();
  }

  @Get('my-business')
  @ApiOperation({ summary: "Get the authenticated user's business" })
  @ApiResponse({
    status: 200,
    description: "User's business",
    type: BusinessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto,
  })
  getMyBusiness(@Req() req: any) {
    return this.businessService.getBusinessForUser(req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a business' })
  @ApiParam({ name: 'id', description: 'Business UUID' })
  @ApiBody({ type: UpdateBusinessDto })
  @ApiResponse({
    status: 200,
    description: 'Business updated',
    type: BusinessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessService.update(id, req.user.id, dto);
  }
}

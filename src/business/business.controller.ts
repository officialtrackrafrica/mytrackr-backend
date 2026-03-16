import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
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
import { JwtAuthGuard } from '../auth/guards';
import { BusinessService } from './services/business.service';
import {
  CreateBusinessDto,
  UpdateBusinessDto,
  BusinessResponseDto,
} from './dto';
import { SWAGGER_TAGS } from '../common/docs';
import { ErrorResponseDto } from '../common/errors';


@ApiTags(SWAGGER_TAGS[4].name)
@Controller('businesses')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('accessToken')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new business' })
  @ApiBody({ type: CreateBusinessDto })
  @ApiResponse({
    status: 201,
    description: 'Business created successfully',
    type: BusinessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  create(@Req() req: any, @Body() dto: CreateBusinessDto) {
    return this.businessService.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all businesses for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'List of businesses',
    type: [BusinessResponseDto],
  })
  findAll(@Req() req: any) {
    return this.businessService.findAllForUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific business by ID' })
  @ApiParam({ name: 'id', description: 'Business UUID' })
  @ApiResponse({
    status: 200,
    description: 'Business found',
    type: BusinessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto,
  })
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.businessService.findOne(id, req.user.id);
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a business' })
  @ApiParam({ name: 'id', description: 'Business UUID' })
  @ApiResponse({ status: 204, description: 'Business deleted' })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto,
  })
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.businessService.remove(id, req.user.id);
  }
}

